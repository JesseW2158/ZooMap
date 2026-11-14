# Stream: 01 Campus map

**Branch:** `aads` (owner's branch), based on `origin/main` at `74ce09b`.
**Status:** build script, data, module and layer written; tests, typecheck, lint and build pass. Not yet seen in a browser.

## What is done

- `scripts/build-campus.ts` (`npm run campus:build`, `-- --refresh` to refetch). One Overpass query for the box in `BBOX`, cached in `data/campus/raw/osm.json`. Deterministic: rebuilding from the cached file gives no git diff (checked).
- Logic ported from the owner's prototype `umass-3d-map` (`proc.py`, `build_nav.py`): multipolygon buildings; tagged doors joined to the graph by a short connector that never crosses a building, fence, wall or water; estimated access points (spread around the outline, 1 to 4 by perimeter) for place buildings with fewer than two mapped doors; largest connected component kept.
- Places: named buildings plus named amenities, limited to the OSM "University of Massachusetts Amherst" area (relation 9361144) plus 150 m, so downtown Amherst shops are out. Same-name buildings within 150 m are one place (the Campus Center tower and podium); every footprint of a place carries its `placeId`, so tapping either selects it.
- `data/campus/overrides.json`: 78 places with aliases (ILC, LGRT, CS, ISB, Frank, Woo, Berk, Hamp, JQA, ...), `studyFriendly` (13 places) and category fixes. Keyed by place id; the build warns if an id matches nothing.
- Module: reads the committed files once per instance (`data.ts`, `process.cwd()` paths; Next's file tracing includes them, checked in `.nft.json`). `searchPlaces` ranks exact, then prefix, then word-prefix, then substring; alias matches break ties. `nearestPlace` measures to the footprint (0 inside). Fixture campus deleted.
- Layer: lawns, water, parking, roads and paths; buildings extruded to `heightM`, shaded by height; maroon selection; hover name popup on pointer devices; camera bounds, zoom 14.5 to 19.5, pitch up to 70; a visible "© OpenStreetMap contributors" credit (the MapLibre one is compact and hidden under the sheet).

## Build report (2026-11-14 data)

Buildings 1339 · places 229 · ground features 4380 · walk graph 13205 nodes, 14807 edges, one component (18 before pruning) · doors 196 tagged + 305 estimated · places with an entrance within 80 m: 229/229.

## Done when

- [x] `npm run campus:build` twice produces no git diff
- [x] >= 95% of places have an entrance (100%), graph is one component (tested)
- [ ] Renders recognisably at 60 fps on a phone viewport: **not checked**. Needs a browser and a database for sign-in (no `MONGODB_URI` yet)
- [x] `searchPlaces('ILC')`, `('library')`, `('LGRT')` tested
- [~] `npm run check` passes with `SKIP_DB_TESTS=1` (115/115). The DB tests have not run: no Atlas URI

## For other streams and integration

- **Place ids are OSM ids now** (`w292876549` = ILC, `r4054634` = Du Bois, `w122196717` = LGRT, `w30698361` = Campus Center). `fx-*` ids no longer exist. Activities, recommend and schedule stubs still use them in their fixtures.
- **Edited outside owned paths:** `src/app/api/routes.test.ts`, the three `fx-*` ids replaced by real ids, because the routing stub looks the place up and returned 404 once the fixture campus was gone. Nothing else outside campus paths.
- **Routing:** the prototype's `router.js` has A* with route profiles (fastest / paved only / step-free) and turn-by-turn directions. Its graph also had typed edges and lawn shortcuts across open grass; those are **not** in this graph because `WalkGraph` edges carry only metres. Porting them would need an additive contract field (for example an optional edge-kind array). Routing stream's call.
- Output file tracing also ships `data/campus/raw/osm.json` (5 MB) with each function. Harmless; an `outputFileTracingExcludes` entry would trim it.

## Environment findings

- **Vitest 5 does not run on Node 23** (`ERR_INVALID_PACKAGE_CONFIG`). It needs Node 22.12+, 24 or 26. Use Node 24.
- Do not keep the repo in an iCloud-synced folder (`~/Documents`, `~/Desktop`) on a full disk: macOS offloads `node_modules`, source files and `.git` packs, and every tool stalls. The working copy now lives in `~/code/ZooMap`.
