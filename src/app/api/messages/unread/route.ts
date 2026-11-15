import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { countUnread } from "@/modules/friends";

/** GET /api/messages/unread : { count } for the Friends tab badge. Owner: friends. */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  return countUnread(user.id);
});
