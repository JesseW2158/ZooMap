# Project Decisions

> This file is the shared brain of the 10x-Team. Every role reads it before acting and writes to it after deciding. Append only — never delete or overwrite another role's decisions.

## Project: ZooMap
Started: 2026-11-14

---

<!-- Decisions are appended below by each role. Format:
### [Date] — [Role]: [Decision Title]
- **Decision:** What was decided
- **Why:** Business/technical justification
- **Alternatives considered:** What else was evaluated
- **Trade-offs accepted:** What we're giving up
- **Impacts:** Which roles/components this affects
-->

### 2026-11-14 — Owner + planner: Scope and platform
- **Decision:** Hackathon demo in 24-48 hours. One Next.js web app in TypeScript; an Android app shell (Capacitor) wraps the deployed site to add background location. iPhone users get the browser version.
- **Why:** The owner wants background location, which a web page cannot do. A shell keeps every screen testable in a browser by parallel sessions.
- **Alternatives considered:** Fully native React Native app; web page only.
- **Trade-offs accepted:** Sign-in and background pings need native workarounds (see docs/plan/ws-mobile.md). No iPhone app.
- **Impacts:** All roles. Plan in docs/plan/.

### 2026-11-14 — Owner + planner: Data and integrations
- **Decision:** Density from opt-in user location plus a labelled simulated source. Google sign-in restricted to umass.edu. Schedule from Google Calendar and a Canvas calendar feed link. Outdoor walking routes computed in-app from OpenStreetMap. Gemini picks a study spot from server-computed candidates. MongoDB Atlas. Vercel hosting.
- **Why:** Each is the shortest route to a working demo that needs no agreement with UMass.
- **Alternatives considered:** Official campus occupancy data; emailed sign-in codes; full Canvas integration; a hosted routing service; indoor routing.
- **Trade-offs accepted:** The heatmap is mostly simulated at demo time. UMass may block outside apps on student Google accounts; unverified.
- **Impacts:** Density, auth, schedule, routing, recommend.

### 2026-11-14 — Owner + planner: Points, store and Solana
- **Decision:** Points are paid per minute of location-verified time at an activity, from an append-only MongoDB ledger. A user can be in one activity at a time; hosting counts. Store is a mock catalog with claim codes. Solana is an optional devnet mirror of the ledger, built last.
- **Why:** Database-first works without wallets and lets Solana be added or dropped without touching anything else. Real redemption value on a live token raises legal questions nobody has reviewed.
- **Alternatives considered:** Token as the points; mainnet token; no Solana; points for merely joining; host-confirmed attendance.
- **Trade-offs accepted:** The "one activity at a time" rule was the planner's default, not an explicit owner choice.
- **Impacts:** Activities, rewards, chain.

### 2026-11-14 — Planner: Architecture for parallel work
- **Decision:** Feature modules behind `index.ts`, domain events, plug-in registries and zod contracts, all fixed in a serial foundation phase. Six feature workstreams plus mobile then run in parallel on owned paths, in separate worktrees, databases and ports.
- **Why:** 4-6 sessions will build at once; shared files and the lockfile are what break parallel merges.
- **Alternatives considered:** Fewer, larger workstreams; a separate backend service.
- **Trade-offs accepted:** The foundation phase is large and blocks everything.
- **Impacts:** All roles. Rules are in CLAUDE.md.

### 2026-11-14 — Foundation: contract and tooling decisions the plan left open
- **Decision:** (1) All `_id`s and references are strings from `newId()`. (2) `cacheComponents` and `partialPrefetching` are off in next.config.ts (they force Suspense around anything that reads cookies or the clock); Tailwind runs through `@tailwindcss/postcss`. (3) `requireUser` and `getAuthUser(req)` live in the auth module; `getSessionUser()` serves pages. (4) The user row is upserted in the Auth.js `jwt` callback at sign-in; the `signIn` callback is the pure domain check (`email_verified`, `hd`, exact email domain). The dev provider id is `dev` and seed users have fixed ids `seed-<name>`. (5) Added error codes SHARING_OFF, CAPACITY_FULL, ACTIVITY_ENDED, OUT_OF_STOCK, NOT_CONFIGURED, NOT_IMPLEMENTED and others; each has one HTTP status (`ERROR_STATUS`). (6) Event payload times are `Date`; API times are ISO strings. (7) Added routes `GET /api/presence/sharing`, `GET /api/campus/buildings`, `GET /api/campus/ground`; `DELETE /api/schedule/connections?id=`; the Google calendar connect and callback routes are 302 redirects; join and leave return `{participation, activity}`, end returns the Activity. (8) `nearestPlace` returns `{place, distanceM} | null`. (9) `ActivityDoc` has a denormalised `hostName`. (10) Indexes for later streams (`chain_outbox`, `redemptions`, `device_tokens`) are declared up front. (11) Registry entries are `{id, Component}` (panels add `title`), plus `topSlot` and `headless` lists. (12) No new runtime dependency: a hand-rolled store replaces a state library. (13) Event bus subscriptions are keyed by id and the bus is a globalThis singleton.
- **Why:** Each choice keeps the parallel streams from needing to edit a shared file.
- **Alternatives considered:** ObjectId `_id`s; Next cache components; zustand.
- **Trade-offs accepted:** Fixture campus coordinates (`fx-*` place ids) are approximate, not survey data. `npm audit` reports one critical advisory (`@xmldom/xmldom`) through osmtogeojson, which only runs in the campus build script.
- **Impacts:** All streams.
