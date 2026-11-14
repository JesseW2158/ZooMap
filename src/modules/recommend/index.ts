import type { RecommendBody, RecommendResponse } from "@/shared/contracts";

/**
 * Recommend module (owner: recommend). FOUNDATION STUB: always answers with the same place,
 * labelled `fallback`. The owning stream builds candidates, the deterministic pick and the
 * Gemini call; the signature stays.
 */
export async function recommendStudySpot(userId: string, input: RecommendBody): Promise<RecommendResponse> {
  // FOUNDATION STUB
  void userId;
  void input;
  return {
    placeId: "fx-dubois",
    reason: "Fixture answer: the library is a reliable default.",
    alternatives: [{ placeId: "fx-campus-center", reason: "Fixture alternative: lively, with food nearby." }],
    source: "fallback",
  };
}
