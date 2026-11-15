import type { DensityLevel, Place, PlaceCategory } from "@/shared/contracts";

/**
 * How many people a building of each kind holds when it is full: rough figures for a large
 * UMass building, not measured ones. The simulated crowd and the crowd levels both read this
 * table, so "busy" means the same share of a place in both.
 */
export const CAPACITY: Record<PlaceCategory, number> = {
  dining: 1000,
  library: 1200,
  academic: 800,
  student_life: 800,
  athletic: 600,
  residence: 500,
  other: 150,
};

/** A venue inside a building (a café, an auditorium) holds this share of a whole building. */
const VENUE_SHARE = 0.1;

type Sized = Pick<Place, "id" | "category">;

/**
 * People a place holds when full. Place ids come from OpenStreetMap: "n…" is a point, which
 * on campus is a venue inside some building (Peet's Coffee, Bowker Auditorium); ways and
 * relations ("w…", "r…") are whole buildings (the dining commons, the library).
 */
export function capacityOf(place: Sized): number {
  const full = CAPACITY[place.category];
  return /^n\d/.test(place.id) ? Math.round(full * VENUE_SHARE) : full;
}

/** The share of capacity at which moderate, busy and packed start. Below the first is quiet. */
const LEVEL_SHARES = [0.2, 0.5, 0.8] as const;

/** 0 empty, 1 quiet, 2 moderate, 3 busy, 4 packed: how full this place is for its size. */
export function levelFor(count: number, place: Sized): DensityLevel {
  if (count <= 0) return 0;
  const share = count / capacityOf(place);
  return 1 + LEVEL_SHARES.filter((s) => share >= s).length;
}

/**
 * People that fill the heat scale. Simulated counts estimate everyone in a building; 600
 * keeps the map about as bright as it was when counts were building-blind and peaked at 50.
 */
const SIMULATED_HEAT_FULL = 600;
/** Live counts are only the app's users sharing their location, so far fewer fill it. */
const LIVE_HEAT_FULL = 50;

/** Heat-map weight 0..1 of a count. The heat shows head count, not how full a place is. */
export const heatWeight = (count: number, source: "live" | "simulated") =>
  Math.min(1, count / (source === "live" ? LIVE_HEAT_FULL : SIMULATED_HEAT_FULL));
