# Stream: routing and search

**Branch:** `aads`. Done in the same session as the campus map, at the owner's request (no one else had started routing).
**Status:** done except the browser check of the real app (needs a database for sign-in). `npm run check` passes with `SKIP_DB_TESTS=1` (133 tests).

## What is done

- `engine.ts`: pure A* (binary heap, multi-source/multi-target over place entrances), ported from the owner's prototype `umass-3d-map/router.js`. No server imports, so it bundles for the browser too. Cost multipliers per edge kind: stairs 1.5x (brief), minor road 1.04, major road 1.12. Profiles `fastest` and `stepfree` (no stairs). Coordinate starts snap to the nearest node within 150 m with the straight hop included; farther is `OFF_CAMPUS` (422).
- Turn-by-turn steps: legs grouped by kind and name, split at real turns, legs under 15 m folded into the next. Unnamed walkways (most of campus) get a landmark: "Turn left onto the walkway toward Herter Hall" (known buildings within 90 m ahead of the walker).
- `findRoute` caches the router per server instance; about 1 ms per route on the real graph.
- Edge kinds and names come from the campus build: `data/campus/walk-edges.json` (parallel to `walk-graph.json` edges), exposed as `getWalkEdgeInfo()` / `WALK_KIND` from the campus module.
- UI: search bar with categories and Enter-to-pick; a place card (from search or a map tap) with Directions; route card with time, distance, stair flights, Fastest / Step-free, steps (tap to fly there) and clear; asks for location or a starting building when there is none. Re-routes after about 30 m of walking.

## Contract changes (additive, own commits)

- `b42b216` RouteProfile; optional `profile` on RouteInput and RouteQuery; RouteStep; optional `steps` and `stairs` on RouteResult.
- `0ece66a` optional `id` on PlacesQuery (`GET /api/places?id=`), so a building tapped on the map can show its card.

## Done when

- [x] Hand-built graph with known shortest path; NO_ROUTE; off-campus start; ten real pairs under 1.6x straight line (tested)
- [x] Under 50 ms after warm-up (tested; about 1 ms)
- [ ] In the browser: search "library", Directions, route drawn from the overridden location: **not checked in the real app** (no database). The owner tried the same engine and data in a static preview page.
- [~] `npm run check` passes with `SKIP_DB_TESTS=1`

## Notes

- Lint shows ~1100 warnings from `public/maplibre/maplibre-gl-worker.mjs` once `predev`/`prebuild` has copied it there. Warnings only; an ESLint ignore for `public/` would silence them (not routing's file).
- Not ported from the prototype: lawn and plaza shortcuts (straight lines across open grass), the "paved only" profile. They need a raster pass in the build and more edge kinds.
