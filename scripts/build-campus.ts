/**
 * `npm run campus:build`: regenerate `data/campus/` from OpenStreetMap.
 *
 * FOUNDATION STUB (owner: 01-campus-map). The campus stream writes this: query the
 * Overpass API for the UMass Amherst bounding box, convert with osmtogeojson, and write
 * places.json, buildings.geojson, ground.geojson and walk-graph.json (shapes in
 * `src/shared/contracts/campus.ts`). Until then the app serves the fixture campus in
 * `src/modules/campus/fixtures/`.
 */
console.error("campus:build is not implemented yet. The campus-map workstream owns this script (docs/plan/01-campus-map.md).");
process.exitCode = 1;
