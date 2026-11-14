import { z } from "zod";
import { Id, LatLng } from "./common";

export const RecommendPrefs = z.strictObject({
  /** Quiet (low density) when true, social (high density) when false, no preference when omitted. */
  quiet: z.boolean().optional(),
  maxWalkMinutes: z.number().int().min(1).max(60).optional(),
  minutesAvailable: z.number().int().min(5).max(600).optional(),
  nearNextClass: z.boolean().optional(),
  /** Free text from the user. Treated as data, never as instructions. */
  text: z.string().trim().max(280).optional(),
});
export type RecommendPrefs = z.infer<typeof RecommendPrefs>;

/** POST /api/recommend */
export const RecommendBody = z.strictObject({
  origin: z.union([LatLng, z.object({ placeId: Id })]),
  prefs: RecommendPrefs.default({}),
});
export type RecommendBody = z.infer<typeof RecommendBody>;

export const RecommendResponse = z.object({
  placeId: Id,
  reason: z.string(),
  alternatives: z.array(z.object({ placeId: Id, reason: z.string() })),
  /** Which answered. A fallback answer is labelled as such in the UI. */
  source: z.enum(["gemini", "fallback"]),
});
export type RecommendResponse = z.infer<typeof RecommendResponse>;
