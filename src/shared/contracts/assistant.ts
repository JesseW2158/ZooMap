import { z } from "zod";
import { Id, LatLng } from "./common";
import { Activity } from "./activities";
import { DensityLevel } from "./density";

/**
 * Added after Phase 0 (assistant module): the campus chatbot. Stateless: the client sends the
 * recent conversation each time and nothing is stored on the server.
 */

export const ChatMessage = z.strictObject({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(1000),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

/** POST /api/assistant/chat. The last message must be the user's. */
export const ChatBody = z
  .strictObject({
    messages: z.array(ChatMessage).min(1).max(12),
    /** Where walking times are measured from; the campus centre when omitted. */
    origin: z.union([LatLng, z.object({ placeId: Id })]).optional(),
  })
  .refine((b) => b.messages.at(-1)?.role === "user", { message: "the last message must be from the user" });
export type ChatBody = z.infer<typeof ChatBody>;

/** Something the reply refers to, shown as a tappable card under it. */
export const ChatCard = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("activity"), activity: Activity }),
  z.object({
    kind: z.literal("place"),
    placeId: Id,
    name: z.string(),
    level: DensityLevel.optional(),
    walkMin: z.number().nonnegative().optional(),
    /** Part of the crowd count is simulated. */
    simulated: z.boolean().optional(),
  }),
]);
export type ChatCard = z.infer<typeof ChatCard>;

export const ChatResponse = z.object({
  reply: z.string(),
  cards: z.array(ChatCard),
  /** Which answered. A fallback reply is labelled as such in the UI. */
  source: z.enum(["gemini", "fallback"]),
});
export type ChatResponse = z.infer<typeof ChatResponse>;
