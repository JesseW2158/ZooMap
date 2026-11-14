import type {
  BuildingCollection,
  GroundCollection,
  LatLng,
  NearestPlace,
  Place,
  WalkGraph,
} from "@/shared/contracts";
import { haversineM } from "@/shared/geo";
import { FIXTURE_BUILDINGS, FIXTURE_GRAPH, FIXTURE_GROUND, FIXTURE_PLACES } from "./fixtures/campus";

/**
 * Campus module (owner: 01-campus-map). FOUNDATION STUB: serves the fixture campus in
 * `fixtures/`. The owning stream replaces these bodies with the committed `data/campus/`
 * files and never changes a signature.
 */

export async function getPlaces(): Promise<Place[]> {
  return FIXTURE_PLACES;
}

export async function getPlace(id: string): Promise<Place | null> {
  return FIXTURE_PLACES.find((p) => p.id === id) ?? null;
}

/** Case-insensitive match on name and aliases, prefix matches first. */
export async function searchPlaces(q: string, limit = 10): Promise<Place[]> {
  const needle = q.trim().toLowerCase();
  if (!needle) return FIXTURE_PLACES.slice(0, limit);
  const names = (p: Place) => [p.name, ...p.aliases].map((n) => n.toLowerCase());
  const prefix = FIXTURE_PLACES.filter((p) => names(p).some((n) => n.startsWith(needle)));
  const contains = FIXTURE_PLACES.filter((p) => !prefix.includes(p) && names(p).some((n) => n.includes(needle)));
  return [...prefix, ...contains].slice(0, limit);
}

/**
 * The closest place within `maxM` metres, or null. The real version measures to the building
 * footprint (0 when inside); this stub measures to the centre.
 */
export async function nearestPlace(pos: LatLng, maxM: number): Promise<NearestPlace | null> {
  let best: NearestPlace | null = null;
  for (const place of FIXTURE_PLACES) {
    const distanceM = haversineM(pos, place.center);
    if (distanceM <= maxM && (!best || distanceM < best.distanceM)) best = { place, distanceM };
  }
  return best;
}

export async function getWalkGraph(): Promise<WalkGraph> {
  return FIXTURE_GRAPH;
}

/**
 * Added by Foundation beyond the contract table, so the map layer can load geometry over
 * `GET /api/campus/buildings` and `/ground` instead of bundling it into the client.
 */
export async function getBuildings(): Promise<BuildingCollection> {
  return FIXTURE_BUILDINGS;
}

export async function getGround(): Promise<GroundCollection> {
  return FIXTURE_GROUND;
}
