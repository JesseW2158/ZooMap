# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ZooMap is a campus app for UMass Amherst: a 3D map with a people-density heatmap, walking routes, class schedule, hosted activities and points. It is a hackathon project built by several Claude sessions in parallel.

## Start here

- The plan is in `docs/plan/`. Read `docs/plan/README.md`, then `docs/plan/contracts.md`, then the one brief for your workstream. Your brief names the paths you own and its "Done when" list is your finish line.
- Project decisions and status are in `.10x/`. `decisions.md` is append-only. Workstream sessions write only their own `.10x/streams/<stream>.md`.
- The foundation phase is merged (`scaffold-checkpoint` tag marks scaffold plus contracts). Read `.10x/handoff.md` for what each stream needs to know.

## Commands

- `npm run dev`: dev server
- `npm run check`: `next typegen`, typecheck, lint and tests; run before every merge. The database tests need `MONGODB_URI`; `SKIP_DB_TESTS=1` leaves them out, and a run that skipped them is not a full pass
- `npm run build`: production build; needs no secrets
- `npm test -- path/to/file.test.ts`: one test file. `*.test.ts` run in parallel; `*.db.test.ts` run one file at a time against `${MONGODB_DB}_test`
- `npm run db:setup`: ensure indexes and seed data; safe to repeat
- `npm run campus:build`: regenerate `data/campus/` from OpenStreetMap (a stub until the campus stream writes it)
- Env: copy `.env.example` to `.env.local`. Auth.js needs `AUTH_SECRET` or `auth()` returns 500. Set `NEXT_PUBLIC_DEV_TOOLS=1` for the click-to-set-location tool.

## Architecture

One Next.js app in TypeScript, deployed on Vercel, with MongoDB Atlas. An Android shell in `android/` wraps the deployed site to add background location.

- `src/app/` holds routes only. API handlers validate, call a module, return.
- `src/modules/<feature>/` holds all feature code. Import another module only through its `index.ts`.
- `src/shared/` holds contracts (zod), the database client, the event bus and client seams.
- Modules talk through domain events (`participation.ended`) on the in-process bus, and plug into registries (map layers, panels, density sources, schedule providers, reward rules). A new feature is a new module folder plus one registry line.
- Vercel is serverless: there are no background jobs or websockets. Time-based work is settled lazily on the next request, and clients poll.

## Conventions set by the foundation

- Every module has `index.ts` (public server API), `subscribers.ts`, `seed.ts` (idempotent, insert-if-missing) and `ui/`. Inside a module use relative imports. ESLint enforces the boundaries: no `@/modules/x/y` from outside, no server imports (`mongodb`, `@/shared/db`, `@/shared/config/env`, module indexes) in `ui/`, `src/app/_shell/` or `src/shared/ui|platform`, and no module imports in `src/shared`.
- Stub bodies are marked `// FOUNDATION STUB`; the owning stream replaces the body and keeps the signature. UI stubs export `XxxPanel`, `XxxLayer`, `RoutingSearch`, `MobileBridge`; `src/app/registry.ts` already lists them.
- All `_id`s and references are strings (`newId()`), never ObjectIds. Dates cross the API as ISO strings and the event bus as `Date`.
- Routes: `apiRoute(handler, { status })`, `await requireUser(req)` first, `parseBody`/`parseQuery` with zod, throw `ApiError(code)`. `src/app/api/routes.test.ts` walks `API_ROUTES`, so a new route needs a table entry.
- Emit events with `emit()` from `@/shared/events`; it registers every module's subscribers first. Subscriptions are keyed by id, so registering twice replaces.
- Map layers: `useMapEffect`, `addLayerToSlot(map, spec, "slot-lines")`, ids prefixed with the module name. Panels reach the map only through `useMapStore()`. There is no glyph source, so no text labels on the map.
- Indexes live only in `src/shared/db/indexes.ts`; a new one is a single-purpose commit touching that file, and `npm run db:setup` applies it.
- DB tests: `const t = withTestDb()` from `@/shared/db/testing` in a `*.db.test.ts` file.

## Working in parallel

- Work in your own worktree and branch: `git worktree add ../ZooMap-<stream> -b ws/<stream>`, then `npm ci`, a copy of `.env.local` with its own `MONGODB_DB` (for example `zoomap_density`), and `npm run db:setup`. A new database has no indexes until that runs.
- Run the dev server on your own port: `npm run dev -- -p 3001`. Next does not read the port from `.env.local`. Sign in with `DEV_AUTH=1`; Google sign-in is registered for port 3000 only.
- Database tests use `withTestDb()`, which works in `${MONGODB_DB}_test`.
- Edit only the paths your brief says you own. `src/shared/**`, `src/app/registry.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `package.json` and the lockfile are frozen after the foundation phase.
- A contract change is additive, a commit of its own touching only `src/shared/contracts/`, rebased onto `main` at once. A new dependency needs the owner's yes and the same single-purpose commit.
- Commit to your own branch as you go. Merge to `main` when your "Done when" list passes, your branch is rebased, `npm run check` is green, and the owner has said to merge.
- Keep progress, findings and anything the next session needs in `.10x/streams/<stream>.md`. Other worktrees see only what is merged to `main`, so merging is how you announce something. `.10x/status.md` and `.10x/handoff.md` belong to the foundation and integration sessions.

## Rules that are easy to get wrong

- Next 16, MapLibre 6, zod 4 and Auth.js v5 are recent. Check current docs before writing framework code.
- "One hosted activity per user" and "one activity at a time" are unique partial indexes. Insert and handle the duplicate-key error.
- Points come from server timestamps and go through the append-only ledger with an idempotency key. Client-reported durations are ignored.
- Location is stored as a coarse cell and a place id, one document per user, expiring after ten minutes. Coordinates and history are never stored.
- Simulated density is a pure function of time and is labelled as simulated in the API and the UI.
- Restricting sign-in to `umass.edu` is checked on the server from the verified token claims.
