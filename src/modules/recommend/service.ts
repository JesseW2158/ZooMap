import type { DensityResponse, LatLng, Place, RecommendBody, RecommendResponse, RouteInput, RouteResult, ScheduleEvent } from "@/shared/contracts";
import { env } from "@/shared/config/env";
import { haversineM } from "@/shared/geo";
import { ApiError } from "@/shared/http";
import { getPlace, getPlaces } from "@/modules/campus";
import { getDensitySnapshot } from "@/modules/density";
import { findRoute } from "@/modules/routing";
import { getUpcomingEvents } from "@/modules/schedule";
import { buildCandidates, STRAIGHT_LINE_DETOUR, WALK_M_PER_MIN, type Candidate, type NextClass, type WalkTime } from "./candidates";
import { askGemini, geminiGenerate, GEMINI_TIMEOUT_MS, type Generate } from "./gemini";
import { pickDeterministic, rankCandidates } from "./score";

/** Everything the recommender reads from other modules, so tests can swap any of it. */
export interface RecommendDeps {
  now: () => Date;
  getPlaces: () => Promise<Place[]>;
  getPlace: (id: string) => Promise<Place | null>;
  getDensity: () => Promise<DensityResponse>;
  findRoute: (input: RouteInput) => Promise<RouteResult>;
  getUpcomingEvents: (userId: string, range: { from: Date; to: Date }) => Promise<ScheduleEvent[]>;
  /** Null when no Gemini key is configured. */
  generate: Generate | null;
  geminiTimeoutMs: number;
}

export function defaultDeps(): RecommendDeps {
  const e = env();
  return {
    now: () => new Date(),
    getPlaces,
    getPlace,
    getDensity: () => getDensitySnapshot(),
    findRoute,
    getUpcomingEvents,
    generate: e.geminiApiKey ? geminiGenerate(e.geminiApiKey, e.geminiModel) : null,
    geminiTimeoutMs: GEMINI_TIMEOUT_MS,
  };
}

/** How far ahead to look for the next class. */
const NEXT_CLASS_WINDOW_MS = 12 * 60 * 60 * 1000;

/** The next timed event today with a resolved place. Deadlines, all-day and skipped items are not somewhere to be. */
export function nextClassFrom(events: ScheduleEvent[], now: Date): NextClass | null {
  const t = now.getTime();
  const upcoming = events
    .filter((e) => e.placeId && !e.deadline && !e.allDay && !e.skipped && Date.parse(e.start) > t)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const first = upcoming[0];
  return first ? { placeId: first.placeId!, startsInMin: (Date.parse(first.start) - t) / 60_000 } : null;
}

const estimate = (a: LatLng, b: LatLng): WalkTime => ({ minutes: (haversineM(a, b) * STRAIGHT_LINE_DETOUR) / WALK_M_PER_MIN, estimated: true });

/** Candidates for this user and moment, plus the next class they were measured against. */
async function prepare(deps: RecommendDeps, userId: string, input: RecommendBody): Promise<{ cands: Candidate[]; next: NextClass | null }> {
  const now = deps.now();
  const prefs = input.prefs;

  let originPlace: Place | null = null;
  let originPos: LatLng;
  if ("placeId" in input.origin) {
    originPlace = await deps.getPlace(input.origin.placeId);
    if (!originPlace) throw new ApiError("NOT_FOUND", `Unknown place ${input.origin.placeId}`);
    originPos = originPlace.center;
  } else {
    originPos = { lat: input.origin.lat, lng: input.origin.lng };
  }
  const from: RouteInput["from"] = originPlace ? { placeId: originPlace.id } : originPos;

  // The schedule is optional: a failure there should not stop a recommendation.
  const [places, density, events] = await Promise.all([
    deps.getPlaces(),
    deps.getDensity(),
    deps.getUpcomingEvents(userId, { from: now, to: new Date(now.getTime() + NEXT_CLASS_WINDOW_MS) }).catch((err: unknown) => {
      console.warn("[recommend] schedule unavailable:", err instanceof Error ? err.message : err);
      return [] as ScheduleEvent[];
    }),
  ]);
  const next = nextClassFrom(events, now);
  const nextPlace = next ? places.find((p) => p.id === next.placeId) ?? null : null;

  const walk = async (fromSpec: RouteInput["from"], fromPos: LatLng, to: Place): Promise<WalkTime> => {
    if ("placeId" in fromSpec && fromSpec.placeId === to.id) return { minutes: 0, estimated: false };
    try {
      const r = await deps.findRoute({ from: fromSpec, to: { placeId: to.id } });
      return { minutes: r.durationS / 60, estimated: false };
    } catch {
      return estimate(fromPos, to.center);
    }
  };

  const cands = await buildCandidates({
    places,
    density,
    prefs,
    next: nextPlace ? next : null,
    walkFromOrigin: (p) => walk(from, originPos, p),
    walkToNext: (p) => walk({ placeId: p.id }, p.center, nextPlace!),
  });
  if (!cands.length) throw new ApiError("NOT_FOUND", "No study spots are known on this campus map");
  return { cands, next: nextPlace ? next : null };
}

export async function recommendWith(deps: RecommendDeps, userId: string, input: RecommendBody): Promise<RecommendResponse> {
  const { cands, next } = await prepare(deps, userId, input);
  if (deps.generate) {
    const answer = await askGemini(deps.generate, cands, input.prefs, next, deps.geminiTimeoutMs);
    if (answer) return answer;
  }
  return pickDeterministic(cands, input.prefs, next);
}

/** The deterministic pick and the facts behind the top three, best first. No Gemini. */
export async function pickStudySpotsWith(
  deps: RecommendDeps,
  userId: string,
  input: RecommendBody,
): Promise<{ pick: RecommendResponse; spots: Candidate[] }> {
  const { cands, next } = await prepare(deps, userId, input);
  return { pick: pickDeterministic(cands, input.prefs, next), spots: rankCandidates(cands, input.prefs, next).slice(0, 3) };
}
