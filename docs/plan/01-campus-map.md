# 01 Campus map

Builds the campus data from OpenStreetMap with one script and renders the 3D base map. Runs in parallel with the other streams, which use Foundation's fixture campus until this merges. It is on the critical path for the demo's look and for real routes, so start it first.

**Owns:** `scripts/build-campus.ts`, `data/campus/**`, `src/modules/campus/**`.

**Early start:** from the `scaffold-checkpoint` tag you may write the script and generate the data. Touch only `scripts/build-campus.ts` and `data/campus/**` until Foundation has merged; Foundation is still writing `src/modules/campus/` and the map provider.

## Build script (`npm run campus:build`)

1. Fetch from the Overpass API everything inside a bounding box held in one constant. Start with south 42.376, west -72.541, north 42.401, east -72.514 and adjust after looking at the result. Save the raw response to `data/campus/raw/osm.json` and reuse it unless `--refresh` is passed, so rebuilds work offline.
2. **Buildings:** every `building=*` polygon, multipolygons included. `heightM` = the `height` tag, else `building:levels` x 3.5, else 10.
3. **Places:** named buildings plus named amenities. Derive `category` from tags (`amenity=library`, `building=dormitory`, dining amenities, `leisure=sports_centre`, `building=university`). Merge `data/campus/overrides.json`, a hand-written file keyed by place id that supplies `aliases`, `studyFriendly` and category fixes. Write overrides for at least the 40 best-known buildings, with the abbreviations students and course listings use.
4. **Ground:** footways, roads, grass, water and parking, each tagged with `kind`, for display.
5. **Walk graph:** ways whose `highway` is walkable (footway, path, pedestrian, steps, cycleway, living_street, residential, service, unclassified, tertiary), dropping `foot=no` and `access=private`. Split ways at shared nodes; edge weight is metres. Keep only the largest connected component.
6. **Entrances:** for each place, the graph nodes tagged `entrance=*` on its outline, else the nearest graph node to its outline.
7. Print a report: counts of buildings, places, graph nodes and edges, and the places with no entrance within 80 m.

The script is deterministic: the same raw file gives byte-identical output. Commit all output.

## Base map (`src/modules/campus/`)

- Implement the campus module functions from contracts.md over the committed files, replacing the fixture campus. `searchPlaces` is a case-insensitive match on name and aliases, prefix matches first.
- `ui/Layer.tsx`: ground features, then buildings as extrusions using `heightM`, on a plain background with no outside tile service. Pitched camera, rotation and zoom limits that keep the campus in view. Tapping a building calls `selectPlace`.
- A visible "© OpenStreetMap contributors" attribution. The licence requires it.

## Done when

- `npm run campus:build` twice produces no git diff.
- The report shows at least 95% of places with an entrance, and the graph is one component.
- The map renders the campus in 3D, recognisably, at 60 fps on a mid-range phone viewport in browser dev tools.
- `searchPlaces('ILC')`, `('library')` and `('LGRT')` return the right buildings (tested).
- `npm run check` passes.
