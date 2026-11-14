# Workstream: density

The heatmap: where people are, from opt-in location and a simulated source.

**Owns:** `src/modules/density/**`, `src/app/api/density/**`, `src/app/api/presence/**`.
**Provides:** `getDensitySnapshot`, the `presence.updated` event, the density layer and legend.
**Consumes:** campus module, `useUserLocation`, `getAuthUser`.

## Build

1. **Ping** (`POST /api/presence/ping`): reject with 403 when the user's `shareLocation` is off. Compute the H3 cell at resolution 10 and `nearestPlace(pos, 60)`. Upsert the single `presence` document for the user with `expiresAt` ten minutes out. Emit `presence.updated` carrying the raw position. **Store the cell and place only: no coordinates, no history.**
2. **Sharing** (`PUT /api/presence/sharing`): sets the flag; turning it off deletes the presence document.
3. **Sources.** `live`: counts from `presence` where `updatedAt` is within ten minutes (the TTL sweep lags by up to a minute, so filter in the query), dropping counts under `DENSITY_MIN_LIVE_COUNT`. `simulated`, when `SIMULATED_DENSITY=1`: **a pure function of place, category and the five-minute time bucket**, with a seeded hash for noise. Compute the hour and weekday in `America/New_York`; Vercel runs in UTC. Shape it by category: classrooms peak on the hour between 9 and 5 on weekdays, dining at meal times, libraries in the evening, residences at night. There is no background process on Vercel to tick a simulation forward.
4. **Snapshot** (`GET /api/density`): sum the sources per place, keep `live` and `simulated` separate, set `hasSimulated`, compute `level` 0-4, and return heatmap points. Cache for five seconds.
5. **Client.** A heatmap layer in `slot-ground` plus building colour by `level`, polling every ten seconds and pausing when the tab is hidden. A legend that says "includes simulated data" whenever `hasSimulated` is true. A first-run sheet explaining what is shared before asking for location, with the sharing toggle in the panel. A pinger that posts `useUserLocation()` every 60 seconds while sharing is on and `isNativeShell()` is false; in the shell, the mobile stream's native pinger does this.

## Done when

- Tests cover: simulated source is deterministic for a fixed time and differs across categories and hours; live counts expire after ten minutes; pings are refused with sharing off; the minimum-count threshold.
- With the dev location override, clicking the map moves the user's contribution on the heatmap within one poll.
- After a ping, the `presence` collection holds exactly one document for the user and no coordinates.
- `npm run check` passes.

## Stretch

Filter the heatmap by category; show a place's trend over the day from the simulated curve.
