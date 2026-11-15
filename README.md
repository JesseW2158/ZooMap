<p align="center">
  <img src="public/logo/minute-map-circle-192.png" alt="ZooMap logo" width="96" height="96">
</p>

<h1 align="center">ZooMap</h1>

<p align="center">
  A 3D campus map for UMass Amherst with a live crowd heatmap, walking routes, your class schedule,
  hosted activities, and points for time spent at them.
</p>

ZooMap started as a 24-48 hour hackathon project. It is one Next.js app on MongoDB Atlas, plus an
Android shell that adds background location.

## What it does

- **3D campus map** drawn from ZooMap's own OpenStreetMap extract (no outside map tiles), with
  buildings, ground and places.
- **Crowd heatmap** of how busy each building is, from opted-in users' locations plus a simulated
  source. Simulated data is always labelled as such in the API and the UI.
- **Walking routes** between places, computed in the app from OpenStreetMap footpaths (outdoors only).
- **Schedule** from a Google Calendar connection or a Canvas calendar feed link, with a "leave by" time.
- **Study-spot recommendations and a campus chatbot** powered by Gemini, working from candidates the
  server computes. A deterministic fallback answers when Gemini is unavailable.
- **Activities** that students host and join. Time at an activity is verified by location.
- **Points and a store.** Verified minutes earn points through an append-only ledger. Points are
  redeemed in a mock store for a claim code.
- **Friends and messages** through QR friend codes and activity invites. There is no user search.
- **Planned events and notifications** for exams, leave-by times, quiet rooms and big events.
- **Optional Solana devnet mirror** of the points ledger. It is never on the path of a points operation.
- **Sign-in** with Google, restricted to `umass.edu` and checked on the server from the verified token claims.

## Tech stack

| Area | Choice |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Map | MapLibre GL 6, used directly |
| Auth | Auth.js v5 (`next-auth` beta), Google sign-in, JWT sessions |
| Data | MongoDB Atlas with the native driver, no ODM |
| Validation | zod 4 contracts shared by routes, documents and tests |
| Location cells | `h3-js` |
| AI | `@google/genai` (Gemini) |
| Mobile | Capacitor 8 Android shell with background geolocation |
| Tests | Vitest |
| Hosting | Vercel (serverless: no background jobs, no websockets) |

Next 16, MapLibre 6, zod 4 and Auth.js v5 are recent. Check their current docs before writing framework code.

## Getting started

### Prerequisites

- Node.js 22 or newer and npm
- A MongoDB Atlas cluster (or any MongoDB reachable from your machine)
- For real sign-in: a Google OAuth client. For local work, `DEV_AUTH=1` signs you in as a seed user instead.
- Optional: a Gemini API key, and Android Studio with a phone for the Android shell

### Run it locally

```sh
npm ci
cp .env.example .env.local     # then fill it in, see below
npm run db:setup               # creates indexes and seed data; safe to repeat
npm run dev                    # http://localhost:3000
```

The minimum `.env.local` for local development:

```sh
MONGODB_URI=<your connection string>
MONGODB_DB=zoomap
AUTH_SECRET=<32 random bytes, base64>   # npx auth secret; without it auth() returns 500
DEV_AUTH=1                              # adds seed users on /signin; refused when NODE_ENV=production
NEXT_PUBLIC_DEV_TOOLS=1                 # optional: click-to-set-location tool on the map
```

With `DEV_AUTH=1`, `/signin` offers five seed users (`dev.alex@umass.edu`, `dev.blair`, `dev.casey`,
`dev.drew`, `dev.eli`). To fill an account with friends, live activities, classes and points for a
demo, run `npx tsx scripts/seed-demo.ts [email]` (add `--remove` to undo it).

### Environment variables

`.env.example` documents every variable. The ones you are most likely to touch:

| Variable | Purpose |
|---|---|
| `MONGODB_URI`, `MONGODB_DB` | Database connection and name. Tests run in `${MONGODB_DB}_test`. |
| `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Auth.js and Google sign-in |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated sign-in domains. Defaults to `umass.edu`. |
| `DEV_AUTH` | `1` enables seed-user sign-in. Never in production. |
| `ENCRYPTION_KEY`, `ICS_ALLOWED_HOSTS` | Encrypts stored calendar secrets; hosts a feed link may point at |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Study-spot picks and the chatbot |
| `SIMULATED_DENSITY` | `1` turns the labelled simulated density source on |
| `DENSITY_MIN_LIVE_COUNT` | Live counts below this are dropped. `1` is for demos; use 3 or more for a real launch, because a count of 1 reveals a person. |
| `GEOFENCE_ENFORCED`, `POINTS_PER_MINUTE` | Demo knobs for the distance check and point rate |
| `NEXT_PUBLIC_APP_URL` | Deployed origin, used by the Android shell |

Never commit `.env.local`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server. Add `-- -p 3001` for another port. |
| `npm run build` | Production build. Needs no secrets. |
| `npm run check` | `next typegen`, typecheck, lint and tests. Run it before every merge. |
| `npm test -- path/to/file.test.ts` | One test file |
| `npm run db:setup` | Ensure indexes and seed data |
| `npm run campus:build` | Regenerate `data/campus/` from OpenStreetMap (`-- --refresh` re-fetches) |

`*.test.ts` files run in parallel. `*.db.test.ts` files run one at a time against the test database
and need `MONGODB_URI`. `SKIP_DB_TESTS=1` leaves them out, but a run that skipped them is not a full pass.

## Architecture

```
src/
  app/                 routes only: pages and thin API handlers (validate, call a module, return)
  modules/<feature>/   all feature code: index.ts, subscribers.ts, seed.ts, ui/
  shared/              zod contracts, db client and indexes, event bus, http helpers, client seams
scripts/               campus build, db setup, demo seed
data/campus/           generated map data, committed
android/               Capacitor shell
docs/plan/             the build plan, contracts and one brief per workstream
.10x/                  project decisions and per-stream status
```

Feature modules: `activities`, `assistant`, `auth`, `campus`, `chain`, `density`, `friends`, `mobile`,
`notifications`, `planned`, `recommend`, `rewards`, `routing`, `schedule`.

Four seams keep features independent:

1. **Module boundary.** Other code imports a module only through its `index.ts`. ESLint enforces this,
   and also keeps server imports out of client code.
2. **Domain events.** Modules announce facts such as `participation.ended` on an in-process bus, and
   others subscribe. Rewards never imports activities.
3. **Registries.** Map layers, panels, density sources, schedule providers and reward rules are
   plug-in lists in `src/app/registry.ts`. A new feature is a module folder plus one registry line.
4. **Contracts.** Zod schemas in `src/shared/contracts/` define every API shape and stored document.

Because Vercel is serverless, time-based work (ending stale activities, expiring presence) is settled
lazily on the next request, and clients poll.

### Privacy and integrity rules

- Location is stored as a coarse H3 cell and a place id, one document per user, expiring after ten
  minutes. Coordinates and history are never stored.
- Points come from server timestamps and go through the append-only ledger with an idempotency key.
  Client-reported durations are ignored.
- "One hosted activity per user" and "one activity at a time" are unique partial indexes.

## Android app

`android/` is a Capacitor WebView on the deployed site, plus native code for the sign-in hand-off
(Google refuses sign-in inside a WebView, so it runs in the system browser) and background location.
iPhone users use the site in the browser with foreground-only location.

Build and test steps are in [docs/plan/mobile-build.md](docs/plan/mobile-build.md). Real-phone
checks, such as the 15-minute screen-off location test, are still pending.

## Documentation

- [docs/plan/README.md](docs/plan/README.md): decisions, stack, phases, risks and the demo script
- [docs/plan/contracts.md](docs/plan/contracts.md): shared types, events, registries and the API table
- `docs/plan/ws-*.md`: one brief per workstream
- [CLAUDE.md](CLAUDE.md): conventions and rules for working in this repo, including parallel worktrees
- `.10x/decisions.md` and `.10x/streams/`: decisions log and per-stream notes

## Known limits

- The demo heatmap is mostly simulated; there are rarely enough live users to fill it.
- A failed points award is logged, not retried.
- The store is a mock. There is no agreement with the UMass store and no legal review of rewards, so
  Solana stays on devnet.
- UMass may block outside apps from signing in with student Google accounts. The domain restriction
  has only been checked on the server side and with `DEV_AUTH`.

## License

No license file is included yet. Until one is added, all rights are reserved by the authors.
