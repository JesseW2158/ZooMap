import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { markConversationRead } from "@/modules/friends";

/** POST /api/messages/:friendId/read : mark what the friend sent you as read. Owner: friends. */
export const POST = apiRoute(async (req, ctx: RouteContext<"/api/messages/[id]/read">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  return markConversationRead(user.id, id);
});
