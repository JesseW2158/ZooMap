import type {
  BuildingCollection,
  GroundCollection,
  LatLng,
  LngLat,
  NearestPlace,
  Place,
  WalkGraph,
} from "@/shared/contracts";
import { haversineM } from "@/shared/geo";
import { loadBuildings, loadFootprints, loadGround, loadPlaceById, loadPlaces, loadWalkEdgeInfo, loadWalkGraph } from "./data";
import type { WalkEdgeInfo } from "./walk-kinds";

export { WALK_KIND } from "./walk-kinds";
export type { WalkEdgeInfo, WalkKind } from "./walk-kinds";

/**
 * Campus module (owner: 01-campus-map). Serves the OpenStreetMap extract committed in
 * `data/campus/`, built by `npm run campus:build`.
 */

export async function getPlaces(): Promise<Place[]> {
  return loadPlaces();
}

export async function getPlace(id: string): Promise<Place | null> {
  return loadPlaceById().get(id) ?? null;
}

const normalize = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();

/**
 * Case-insensitive match on name and aliases: exact matches first, then prefix matches
 * (of the whole name or of any word), then substring matches. Ties go to places with an
 * alias match, then by name.
 */
export async function searchPlaces(q: string, limit = 10): Promise<Place[]> {
  const places = loadPlaces();
  const needle = normalize(q);
  if (!needle) return places.slice(0, limit);
  const scored: { place: Place; score: number }[] = [];
  for (const place of places) {
    let score = Infinity;
    const candidates: [string, boolean][] = [[place.name, false], ...place.aliases.map((a): [string, boolean] => [a, true])];
    for (const [text, isAlias] of candidates) {
      const n = normalize(text);
      const bonus = isAlias ? 0 : 0.5;
      if (n === needle) score = Math.min(score, 0 + bonus);
      else if (n.startsWith(needle)) score = Math.min(score, 2 + bonus);
      else if (n.split(/[^a-z0-9&]+/).some((w) => w.startsWith(needle))) score = Math.min(score, 4 + bonus);
      else if (n.includes(needle)) score = Math.min(score, 6 + bonus);
    }
    if (score < Infinity) scored.push({ place, score });
  }
  scored.sort((a, b) => a.score - b.score || a.place.name.localeCompare(b.place.name, "en"));
  return scored.slice(0, limit).map((s) => s.place);
}

/** Metres from `pos` to the polygon ring (0 when inside), on a local flat projection. */
function distanceToRingM(pos: LatLng, ring: LngLat[]): number {
  const kx = 111_320 * Math.cos((pos.lat * Math.PI) / 180);
  const ky = 110_540;
  const pts = ring.map(([lng, lat]) => [(lng - pos.lng) * kx, (lat - pos.lat) * ky] as const);
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[j];
    if (ay > 0 !== by > 0 && 0 < ax + ((0 - ay) * (bx - ax)) / (by - ay)) inside = !inside;
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, (-ax * dx - ay * dy) / l2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return inside ? 0 : best;
}

/**
 * The closest place within `maxM` metres, or null. Distance is to the building footprint
 * (0 when inside it) where the place has one, otherwise to its centre.
 */
export async function nearestPlace(pos: LatLng, maxM: number): Promise<NearestPlace | null> {
  const footprints = loadFootprints();
  let best: NearestPlace | null = null;
  for (const place of loadPlaces()) {
    // cheap reject: no campus building is wider than ~600 m
    if (haversineM(pos, place.center) > maxM + 600) continue;
    const rings = footprints.get(place.id);
    const distanceM = rings ? Math.min(...rings.map((r) => distanceToRingM(pos, r))) : haversineM(pos, place.center);
    if (distanceM <= maxM && (!best || distanceM < best.distanceM)) best = { place, distanceM };
  }
  return best;
}

export async function getWalkGraph(): Promise<WalkGraph> {
  return loadWalkGraph();
}

/** Kind and street name of each walk-graph edge, same order as `getWalkGraph().edges`. */
export async function getWalkEdgeInfo(): Promise<WalkEdgeInfo> {
  return loadWalkEdgeInfo();
}

/**
 * Added by Foundation beyond the contract table, so the map layer can load geometry over
 * `GET /api/campus/buildings` and `/ground` instead of bundling it into the client.
 */
let buildingsWithCategories: BuildingCollection | undefined;

/** The building footprints, each tagged with its place's category (for colouring by type). */
export async function getBuildings(): Promise<BuildingCollection> {
  if (buildingsWithCategories) return buildingsWithCategories;
  const placeById = loadPlaceById();
  const fc = loadBuildings();
  buildingsWithCategories = {
    ...fc,
    features: fc.features.map((f) => {
      const category = f.properties.placeId ? placeById.get(f.properties.placeId)?.category : undefined;
      return category ? { ...f, properties: { ...f.properties, category } } : f;
    }),
  };
  return buildingsWithCategories;
}

export async function getGround(): Promise<GroundCollection> {
  return loadGround();
}
