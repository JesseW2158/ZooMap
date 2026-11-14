# Workstream: routing and search

Fastest walking path to a place, and finding the place.

**Owns:** `src/modules/routing/**`, `src/app/api/route/**`, `src/app/api/places/**`.
**Provides:** `findRoute`, the route layer, the search bar.
**Consumes:** the campus module (`getWalkGraph`, `getPlaces`, `searchPlaces`), `useMapStore`, `useUserLocation`. Build against the fixture campus that Foundation ships; the real-graph checks below wait for campus-map to merge.

## Build

1. **Path finding:** A* over the walk graph with a straight-line heuristic and a binary heap, written here, with no routing service. Build the adjacency list once per server instance. `steps` edges cost 1.5x.
2. **Endpoints:** a `placeId` start or end uses the place's `entranceNodes`, trying each and keeping the shortest. A coordinate start snaps to the nearest graph node within 150 m, and the result includes the straight hop to it; farther than that returns 422 `OFF_CAMPUS`.
3. **Result:** a GeoJSON LineString, `distanceM`, and `durationS` at 1.35 m/s.
4. **Search** (`GET /api/places?q=`): a thin handler over the campus module's `searchPlaces`, ten results.
5. **Client:** a search bar in the top slot with results as you type; choosing one selects the place and flies to it. A place sheet with "Directions". A route layer in `slot-lines` that draws whatever `routeRequest` in the map store asks for, from `useUserLocation()` (or a chosen start place when location is unavailable), with distance and minutes, and a clear button.

## Done when

- Tests cover: a hand-built small graph with a known shortest path; no path returns 404 `NO_ROUTE`; off-campus start; on the real graph, routes between ten pairs of well-known buildings exist and each is under 1.6x the straight-line distance.
- A route on the real graph computes in under 50 ms after warm-up.
- In the browser: search "library", press Directions, and a route is drawn from the overridden location.
- `npm run check` passes.

## Stretch

Avoid-stairs option; route preference for less crowded paths using the density snapshot.
