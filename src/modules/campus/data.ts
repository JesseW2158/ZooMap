import { readFileSync } from "node:fs";
import path from "node:path";
import type { BuildingCollection, GroundCollection, LngLat, Place, WalkGraph } from "@/shared/contracts";

/**
 * Loads the committed `data/campus/` files once per server instance. The paths are static
 * `process.cwd()` joins so Next's output file tracing ships the files with the functions.
 */

const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(process.cwd(), "data", "campus", file), "utf8")) as T;

let places: Place[] | undefined;
let placeById: Map<string, Place> | undefined;
let graph: WalkGraph | undefined;
let buildings: BuildingCollection | undefined;
let ground: GroundCollection | undefined;
let footprints: Map<string, LngLat[][]> | undefined;

export function loadPlaces(): Place[] {
  return (places ??= read<Place[]>("places.json"));
}

export function loadPlaceById(): Map<string, Place> {
  return (placeById ??= new Map(loadPlaces().map((p) => [p.id, p])));
}

export function loadWalkGraph(): WalkGraph {
  return (graph ??= read<WalkGraph>("walk-graph.json"));
}

export function loadBuildings(): BuildingCollection {
  return (buildings ??= read<BuildingCollection>("buildings.geojson"));
}

export function loadGround(): GroundCollection {
  return (ground ??= read<GroundCollection>("ground.geojson"));
}

/** Outer rings of every building that belongs to a place, keyed by place id. */
export function loadFootprints(): Map<string, LngLat[][]> {
  if (footprints) return footprints;
  footprints = new Map();
  for (const f of loadBuildings().features) {
    const id = f.properties.placeId;
    if (!id) continue;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const list = footprints.get(id) ?? [];
    for (const poly of polys) list.push(poly[0]);
    footprints.set(id, list);
  }
  return footprints;
}
