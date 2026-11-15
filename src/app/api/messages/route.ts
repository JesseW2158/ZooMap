import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { listConversations } from "@/modules/friends";

/** GET /api/messages : your conversations with friends, newest first. Owner: friends. */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  return listConversations(user.id);
});
