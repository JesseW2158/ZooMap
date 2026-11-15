import type { ChatBody, ChatResponse } from "@/shared/contracts";
import { rateLimit } from "@/modules/friends";
import { chatWith, defaultChatDeps } from "./service";

/** Requests per user per minute to POST /api/assistant/chat. */
export const CHAT_PER_MINUTE = 15;

/**
 * Assistant module (added after Phase 0). A campus chatbot: activities happening now, study
 * spots, and how busy a building is. Stateless: the client sends the recent conversation and
 * nothing is stored. Gemini answers through MinuteMap's tools; without it, keyword answers do.
 */
export async function chat(userId: string, body: ChatBody): Promise<ChatResponse> {
  // Each call can cost several Gemini requests, so cap them per user (RATE_LIMITED, 429).
  await rateLimit("assistant", userId, CHAT_PER_MINUTE, 60_000);
  return chatWith(defaultChatDeps(userId), body);
}
