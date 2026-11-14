# Stream: density

Branch `ws/density`. Status: backend and UI built; `npm run check` green (237 tests, with DB tests). Not yet merged; not yet checked in a browser.

## What exists
- `sources/live.ts`, `sources/simulated.ts`, `sources/index.ts` (registry). Simulated is a pure function of place, category and the five-minute bucket; hour and weekday read in America/New_York.
- `presence.ts`: `recordPing`, `setSharing`, `getSharing`. Presence stores h3 (res 10), placeId, source, times. No coordinates. `presence.updated` carries the raw position (activities already subscribes).
- `index.ts`: `getDensitySnapshot(now?)`. Passing `now` skips the 5 s cache.
- UI: `ui/Layer.tsx` (polling every 10 s, heat layer in `slot-ground`, roof caps coloured by level in `slot-buildings`, pinger), `ui/Panel.tsx` (first-run sheet, sharing switch, busiest places), `ui/Legend.tsx`, `ui/state.ts` (shared store).

## Decisions
- Building colour is a 2.5 m cap on each roof (own source, `density-caps`) because `campus-buildings-3d` belongs to campus and its selection highlight rewrites that layer's paint. A full-height overlay would z-fight.
- The pinger also pings when the position moves 25 m or more (at most every 4 s), so the dev click-to-move shows within one poll; the 60 s heartbeat keeps presence alive.
- `src/app/api/routes.test.ts` got a `@/modules/density` mock, same pattern as activities and schedule.

## For integration
- `SIMULATED_DENSITY=1` is needed for the simulated source. `DENSITY_MIN_LIVE_COUNT` must be 3 or more for a real launch.
- In the Android shell the mobile stream's native pinger posts to `/api/presence/ping`; the web pinger stands down when `isNativeShell()`.
