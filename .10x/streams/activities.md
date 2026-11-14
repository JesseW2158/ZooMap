# Stream: activities

Branch `ws/activities`, worktree `../ZooMap-activities`. Brief: `docs/plan/ws-activities.md`.

## Status (2026-11-14)

Done-when list:
- [x] Tests: concurrent second host gets 409; joining while in another activity gets 409; verified-time arithmetic incl. a gap over 300 s, an out-of-range ping and `GEOFENCE_ENFORCED=0`; `participation.ended` emitted once when leave and settle race. (`src/modules/activities/activities.db.test.ts`, `rules.test.ts`)
- [x] Two dev users against the dev server: host, second host refused (409), join, pings in/out of range, leave. Verified 40 s = 20 + 0 (out of range) + 0 (restart) + 20, and the leave response matched. Run with a local, uncommitted patch to density's ping route that emits `presence.updated` (reverted).
- [x] `npm run check` green with DB tests (in-memory replica set, not Atlas); `npm run build` green.
- [x] Merged `main` in after the campus merge; DB tests now use a real campus place instead of the `fx-*` fixtures.
- [ ] Not merged: PR open, waiting for the owner.

## What other streams need to know

- **Contract additions** (commit `feat(contracts)`, additive): `Activity.placeName?`, `Activity.placeCenter?`; `ParticipationDoc.lastInRangeAt?`; new route `GET /api/activities/places?placeId=&lat=&lng=` → `Place[]` (in `API_ROUTES` as `activitiesPlaces`). Should reach `main` together with its route file (the route-table test fails without it).
- **density**: activities subscribes to `presence.updated` (`activities:verified-time`). Your ping handler must `emit("presence.updated", { userId, position, placeId, at: new Date() })`; `at` is the clock verified time uses. Pings must be refused while sharing is off. The panel reads `GET /api/presence/sharing` for its "sharing is off" state and offers a button that calls `PUT`.
- **rewards**: `participation.ended` carries the final `verifiedSeconds`, emitted exactly once per participation (conditional status flip). `pendingPoints` shown in the UI is `floor(verifiedSeconds/60) * POINTS_PER_MINUTE`, before caps; your award should use the same base.
- **`src/app/api/routes.test.ts`**: now mocks `@/modules/activities` with its fixtures (the real handlers need a DB). Other DB-backed streams can follow the same pattern.

## Behaviour decisions

- In range = within 150 m of the place centre, **or** the ping resolved to the same `placeId` (a big building's footprint can be > 150 m from its centre), or `GEOFENCE_ENFORCED=0`.
- Gap arithmetic: one aggregation-pipeline `updateOne`; a gap of 0 < g < 300 s adds `round(g)` seconds; `$max` keeps a late, out-of-order event from moving the clock back.
- Settling (every read and every ping): activities past `endsAt`; host with no in-range ping for 30 min (`lastInRangeAt ?? joinedAt`); guests for 15 min; participations whose activity is no longer active.
- Capacity: insert, then keep the first `capacity` active participations by `_id`; the loser of a race deletes its own row → 409 `CAPACITY_FULL`.
- Leave is idempotent (returns the ended participation). A host leaving ends the activity. `end` is host-only (403).
- Client: one poller in the layer (5 s in an activity, 10 s otherwise) shared with the panel through a module store.

## Found, not ours (for integration / foundation)

- ~~The map did not render in `next dev` (MapLibre worker).~~ Fixed on `main` (worker served from `public/maplibre/`); this branch has merged it. The markers and geofence ring were still only typechecked when written; check them in a browser.
- **Dark mode makes panel text invisible**: `globals.css` sets `--foreground: #fafaf9` under `prefers-color-scheme: dark`, but the sheet is `bg-white`. The activities panel pins `text-neutral-900`; other panels will need the same fix, or the shell should set the sheet's text colour.

## Local setup used

Node 22 via `fnm`; MongoDB from `mongodb-memory-server` run outside the repo on `127.0.0.1:27027` (replica set `testset`); `.env.local` with `MONGODB_DB=zoomap_activities`, `DEV_AUTH=1`, `NEXT_PUBLIC_DEV_TOOLS=1`. Re-run `npm run check` against Atlas before merging.
