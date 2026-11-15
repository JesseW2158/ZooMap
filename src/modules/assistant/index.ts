import type { ChatBody, ChatResponse } from "@/shared/contracts";
import { chatWith, defaultChatDeps } from "./service";

/**
 * Assistant module (added after Phase 0). A campus chatbot: activities happening now, study
 * spots, and how busy a building is. Stateless: the client sends the recent conversation and
 * nothing is stored. Gemini answers through ZooMap's tools; without it, keyword answers do.
 */
export async function chat(userId: string, body: ChatBody): Promise<ChatResponse> {
  return chatWith(defaultChatDeps(userId), body);
}
