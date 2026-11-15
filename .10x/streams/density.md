# Stream: density

Branch `ws/density`. Status: backend and UI built; `npm run check` green (237 tests, with DB tests). Not yet merged; not yet checked in a browser.

## What exists
- `sources/live.ts`, `sources/simulated.ts`, `sources/index.ts` (registry). Simulated is a pure function of place, category and the five-minute bucket; hour and weekday read in America/New_York.
- `presence.ts`: `recordPing`, `setSharing`, `getSharing`. Presence stores h3 (res 10), placeId, source, times. No coordinates. `presence.updated` carries the raw position (activities already subscribes).
- `index.ts`: `getDensitySnapshot(now?)`. Passing `now` skips the 5 s cache.
- UI: `ui/Layer.tsx` (polling every 10 s, heat layer in `slot-ground`, roof caps coloured by level in `slot-buildings`, pinger), `ui/Panel.tsx` (first-run sheet, sharing switch, busiest places), `ui/Legend.tsx`, `ui/state.ts` (shared store).

## Heatmap (current design)
- In the two full modes, campus is one green-to-red field: a MapLibre heatmap layer with an opaque green zero, placed under `campus-ground-fill`, whose filter is narrowed to water while on (restored when off or unmounted). Roads and paths stay on top.
- Every building is repainted in `density-tint-3d` with the colour of the field at its centre, computed in `ui/field.ts` with MapLibre's own kernel (130 m radius, intensity 3.2) so building and ground agree. Keep `FIELD_RADIUS_M`/`FIELD_INTENSITY` in step with the layer paint in `Layer.tsx`.
- Four map modes (`ui/modes.ts`): Gray–Red (full field, grass hidden, the default), Green–Red (same, **dev settings only**: shown just when `NEXT_PUBLIC_DEV_TOOLS=1`), Gray–Red on grass (translucent heat over the normal map, placed just under `campus-road-casing`), and Off (grass only, plain campus map). Picked from the `Map: …` pill on the map (bottom-left) or the radio list in the Crowds panel; remembered in localStorage `zoomap.density.mode` (an old `zoomap.density.heat=0` migrates to Off). The gray scale starts at mid gray (#808080), darker than the map's own stone.

## Sizes (2026-11-14, owner request)
- `capacity.ts` is the one table of how many people a place holds: dining 1000, library 1200, academic 800, student life 800, athletic 600, residence 500, other 150. These are rough guesses, not measured.
- A place whose id is an OSM node (`n…`: a café or auditorium inside a building) holds a tenth of that. Without this every café in the `dining` category simulated up to 1000 people.
- Levels are a share of that capacity: moderate from 20 %, busy from 50 %, packed from 80 %. So a dining commons is busy from 500 people and packed from 800; a café is busy from 50.
- The simulated source peaks at about 1.15 × capacity. It used to peak near 50 for every kind of place, with fixed thresholds of 10 / 25 / 40.
- Heat weight is head count, not fullness: 600 simulated people fill the scale (chosen to keep the map as bright as before), 50 live ones (live counts are only the app's users).
- Small live counts no longer move a big building's level: 12 live users in a dining commons read "quiet".

## Decisions
- Building colour is a separate full-height copy (`density-tint`), grown 0.3 m so its walls do not z-fight, because `campus-buildings-3d` belongs to campus and its selection highlight rewrites that layer's paint. The selected building is filtered out so campus's maroon shows.
- The pinger also pings when the position moves 25 m or more (at most every 4 s), so the dev click-to-move shows within one poll; the 60 s heartbeat keeps presence alive.
- `src/app/api/routes.test.ts` got a `@/modules/density` mock, same pattern as activities and schedule.

## For integration
- `SIMULATED_DENSITY=1` is needed for the simulated source. `DENSITY_MIN_LIVE_COUNT` must be 3 or more for a real launch.
- In the Android shell the mobile stream's native pinger posts to `/api/presence/ping`; the web pinger stands down when `isNativeShell()`.
