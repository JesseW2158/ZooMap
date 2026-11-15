import type { DensityLevel, DensityResponse, Place, RecommendPrefs } from "@/shared/contracts";

/**
 * Candidate building: the server does the arithmetic. Pure; the walking times come in through
 * `walkMinutes` so tests can pass a table and the service can pass the router.
 */

/** Categories that may be suggested as a study spot. Study-friendly places always qualify. */
export const CANDIDATE_CATEGORIES: ReadonlySet<Place["category"]> = new Set(["library", "academic", "student_life", "dining"]);

/** How many candidates go to Gemini (and to the deterministic pick). */
export const MAX_CANDIDATES = 12;

export interface Candidate {
  placeId: string;
  name: string;
  category: Place["category"];
  studyFriendly: boolean;
  /** People there now (live + simulated). */
  count: number;
  level: DensityLevel;
  /** Whether part of the count is simulated. */
  simulated: boolean;
  /** Walking minutes from the user's origin. */
  walkMin: number;
  /** True when `walkMin` is a straight-line estimate (no route from the origin). */
  walkEstimated: boolean;
  /** Walking minutes from here to the next class, when there is one with a place. */
  walkToNextMin?: number;
}

export interface NextClass {
  placeId: string;
  /** Minutes from now until it starts. */
  startsInMin: number;
}

export interface WalkTime {
  minutes: number;
  estimated: boolean;
}

export interface CandidateInput {
  places: Place[];
  density: DensityResponse;
  prefs: RecommendPrefs;
  next: NextClass | null;
  /** Walking time from the user's origin to a place. */
  walkFromOrigin: (place: Place) => Promise<WalkTime>;
  /** Walking time from a place to the next class's place. */
  walkToNext: (place: Place, nextPlaceId: string) => Promise<WalkTime>;
}

export const isCandidatePlace = (p: Place) => p.studyFriendly || CANDIDATE_CATEGORIES.has(p.category);

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Walking time on foot along a straight line, padded for paths not being straight. */
export const STRAIGHT_LINE_DETOUR = 1.3;
export const WALK_M_PER_MIN = 80;

/**
 * Time we can spend studying there: what is left of the time available after walking there,
 * and after walking on to the next class when the user asked to stay near it.
 */
export function minutesThere(c: Candidate, prefs: RecommendPrefs, next: NextClass | null): number | undefined {
  const budgets: number[] = [];
  if (prefs.minutesAvailable !== undefined) budgets.push(prefs.minutesAvailable - c.walkMin);
  if (next && c.walkToNextMin !== undefined) budgets.push(next.startsInMin - c.walkMin - c.walkToNextMin);
  return budgets.length ? Math.min(...budgets) : undefined;
}

/** Cheap ranking used only to cut the list down to `MAX_CANDIDATES` before scoring. */
function shortlistScore(c: Candidate, prefs: RecommendPrefs): number {
  let s = -c.walkMin;
  if (c.studyFriendly) s += 8;
  if (c.category === "library") s += 3;
  if (c.category === "dining") s += prefs.quiet === true ? -8 : prefs.quiet === false ? 2 : -3;
  if (prefs.quiet === true) s -= 2 * c.level;
  if (prefs.quiet === false) s += 2 * c.level;
  if (c.walkToNextMin !== undefined && prefs.nearNextClass) s -= c.walkToNextMin;
  return s;
}

/**
 * Every eligible place with its count, level and walking times, cut to those within the
 * walking limit (when one is set and something is within it) and then to the best twelve.
 */
export async function buildCandidates(input: CandidateInput): Promise<Candidate[]> {
  const { places, density, prefs, next } = input;
  const byPlace = new Map(density.places.map((d) => [d.placeId, d]));

  const all: Candidate[] = [];
  for (const place of places) {
    if (!isCandidatePlace(place)) continue;
    const d = byPlace.get(place.id);
    const walk = await input.walkFromOrigin(place);
    const c: Candidate = {
      placeId: place.id,
      name: place.name,
      category: place.category,
      studyFriendly: place.studyFriendly,
      count: d?.count ?? 0,
      level: d?.level ?? 0,
      simulated: (d?.simulated ?? 0) > 0,
      walkMin: round1(walk.minutes),
      walkEstimated: walk.estimated,
    };
    if (next) c.walkToNextMin = round1((await input.walkToNext(place, next.placeId)).minutes);
    all.push(c);
  }

  let pool = all;
  if (prefs.maxWalkMinutes !== undefined) {
    const within = all.filter((c) => c.walkMin <= prefs.maxWalkMinutes!);
    if (within.length) pool = within;
  }
  // Places with no time left to study are dropped, unless that would drop everything.
  const withTime = pool.filter((c) => (minutesThere(c, prefs, next) ?? Infinity) > 0);
  if (withTime.length) pool = withTime;

  return pool
    .map((c) => ({ c, s: shortlistScore(c, prefs) }))
    .sort((a, b) => b.s - a.s || a.c.walkMin - b.c.walkMin || a.c.name.localeCompare(b.c.name, "en"))
    .slice(0, MAX_CANDIDATES)
    .map(({ c }) => c);
}
