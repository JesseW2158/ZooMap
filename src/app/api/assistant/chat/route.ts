import { ChatBody } from "@/shared/contracts";
import { apiRoute, parseBody } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { chat } from "@/modules/assistant";

/** POST /api/assistant/chat : { messages, origin? } -> { reply, cards, source }. Owner: assistant. */
export const POST = apiRoute(async (req) => {
  const user = await requireUser(req);
  const body = await parseBody(req, ChatBody);
  return chat(user.id, body);
});
