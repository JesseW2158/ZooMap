import type { RecommendPrefs, RecommendResponse } from "@/shared/contracts";
import { minutesThere, type Candidate, type NextClass } from "./candidates";

/**
 * The deterministic pick: the fallback when Gemini is unavailable, and the baseline. Higher is
 * better. Density dominates for quiet and social; walking time and the next class break ties.
 */
export function scoreCandidate(c: Candidate, prefs: RecommendPrefs, next: NextClass | null): number {
  let s = 0;

  // crowd: level is 0 (empty) to 4 (packed)
  if (prefs.quiet === true) s -= 3 * c.level;
  else if (prefs.quiet === false) s += 3 * c.level - (c.level === 0 ? 3 : 0);
  else s -= 0.75 * Math.max(0, c.level - 2); // no preference: only avoid the packed ones

  // the kind of place
  if (c.studyFriendly) s += 3;
  if (c.category === "library") s += prefs.quiet === false ? 0 : 2;
  if (c.category === "student_life" && prefs.quiet === false) s += 2;
  if (c.category === "dining") s += prefs.quiet === true ? -6 : prefs.quiet === false ? 1.5 : -2;

  // walking: a minute counts more when the user asked for close by
  s -= (prefs.maxWalkMinutes !== undefined && prefs.maxWalkMinutes <= 10 ? 0.5 : 0.25) * c.walkMin;
  if (prefs.maxWalkMinutes !== undefined && c.walkMin > prefs.maxWalkMinutes) s -= 10;

  // the next class
  if (next && c.walkToNextMin !== undefined) s -= (prefs.nearNextClass ? 0.6 : 0.1) * c.walkToNextMin;

  // time to actually sit down
  const there = minutesThere(c, prefs, next);
  if (there !== undefined) {
    if (there <= 0) s -= 20;
    else if (there < 20) s -= (20 - there) * 0.2;
  }
  return s;
}

const LEVEL_WORDS = ["empty", "quiet", "moderately busy", "busy", "packed"] as const;

const mins = (n: number) => `${Math.max(1, Math.round(n))} min`;

/** A short, factual reason built from the numbers. */
export function describe(c: Candidate, prefs: RecommendPrefs, next: NextClass | null): string {
  const parts: string[] = [];
  const crowd = `${LEVEL_WORDS[c.level]} right now${c.simulated ? " (simulated count)" : ""}`;
  parts.push(`${c.name} is ${crowd}`);
  parts.push(`${c.walkEstimated ? "about " : ""}${mins(c.walkMin)} walk`);
  if (next && c.walkToNextMin !== undefined) parts.push(`${mins(c.walkToNextMin)} from your next class`);
  const there = minutesThere(c, prefs, next);
  if (there !== undefined && there > 0) parts.push(`about ${mins(there)} to study there`);
  return `${parts.join(", ")}.`;
}

export function rankCandidates(cands: Candidate[], prefs: RecommendPrefs, next: NextClass | null): Candidate[] {
  return cands
    .map((c) => ({ c, s: scoreCandidate(c, prefs, next) }))
    .sort((a, b) => b.s - a.s || a.c.walkMin - b.c.walkMin || a.c.name.localeCompare(b.c.name, "en"))
    .map(({ c }) => c);
}

/** The best candidate and the next two, with reasons. Needs at least one candidate. */
export function pickDeterministic(cands: Candidate[], prefs: RecommendPrefs, next: NextClass | null): RecommendResponse {
  const [best, ...rest] = rankCandidates(cands, prefs, next);
  return {
    placeId: best.placeId,
    reason: describe(best, prefs, next),
    alternatives: rest.slice(0, 2).map((c) => ({ placeId: c.placeId, reason: describe(c, prefs, next) })),
    source: "fallback",
  };
}
