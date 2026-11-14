# Stream: density

Branch `ws/density`. Status: backend and UI built; `npm run check` green (237 tests, with DB tests). Not yet merged; not yet checked in a browser.

## What exists
- `sources/live.ts`, `sources/simulated.ts`, `sources/index.ts` (registry). Simulated is a pure function of place, category and the five-minute bucket; hour and weekday read in America/New_York.
- `presence.ts`: `recordPing`, `setSharing`, `getSharing`. Presence stores h3 (res 10), placeId, source, times. No coordinates. `presence.updated` carries the raw position (activities already subscribes).
- `index.ts`: `getDensitySnapshot(now?)`. Passing `now` skips the 5 s cache.
- UI: `ui/Layer.tsx` (polling every 10 s, heat layer in `slot-ground`, roof caps coloured by level in `slot-buildings`, pinger), `ui/Panel.tsx` (first-run sheet, sharing switch, busiest places), `ui/Legend.tsx`, `ui/state.ts` (shared store).

## Heatmap (current design)
- With the toggle on, campus is one green-to-red field: a MapLibre heatmap layer with an opaque green zero, placed under `campus-ground-fill`, whose filter is narrowed to water while on (restored when off or unmounted). Roads and paths stay on top.
- Every building is repainted in `density-tint-3d` with the colour of the field at its centre, computed in `ui/field.ts` with MapLibre's own kernel (130 m radius, intensity 3.2) so building and ground agree. Keep `FIELD_RADIUS_M`/`FIELD_INTENSITY` in step with the layer paint in `Layer.tsx`.
- Toggle: `Heatmap on/off` pill on the map (bottom-left) and a switch in the Crowds panel; remembered in localStorage `zoomap.density.heat`.

## Decisions
- Building colour is a separate full-height copy (`density-tint`), grown 0.3 m so its walls do not z-fight, because `campus-buildings-3d` belongs to campus and its selection highlight rewrites that layer's paint. The selected building is filtered out so campus's maroon shows.
- The pinger also pings when the position moves 25 m or more (at most every 4 s), so the dev click-to-move shows within one poll; the 60 s heartbeat keeps presence alive.
- `src/app/api/routes.test.ts` got a `@/modules/density` mock, same pattern as activities and schedule.

## For integration
- `SIMULATED_DENSITY=1` is needed for the simulated source. `DENSITY_MIN_LIVE_COUNT` must be 3 or more for a real launch.
- In the Android shell the mobile stream's native pinger posts to `/api/presence/ping`; the web pinger stands down when `isNativeShell()`.
