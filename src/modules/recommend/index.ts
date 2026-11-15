import type { RecommendBody, RecommendResponse } from "@/shared/contracts";
import { defaultDeps, pickStudySpotsWith, recommendWith } from "./service";

export type { Candidate as StudySpot } from "./candidates";

/**
 * Recommend module (owner: recommend). The server builds study-spot candidates (crowd level,
 * walking time, the next class) and Gemini picks one and explains why. Without a key, on a
 * timeout or on an answer naming an unknown place, a deterministic pick answers instead;
 * `source` says which.
 */
export async function recommendStudySpot(userId: string, input: RecommendBody): Promise<RecommendResponse> {
  return recommendWith(defaultDeps(), userId, input);
}

/**
 * Added for the assistant module: the deterministic pick plus the numbers behind the top
 * three spots (name, crowd level, walking minutes). Never calls Gemini, so a caller that is
 * itself talking to Gemini does not nest a second call.
 */
export async function pickStudySpots(userId: string, input: RecommendBody) {
  return pickStudySpotsWith(defaultDeps(), userId, input);
}
