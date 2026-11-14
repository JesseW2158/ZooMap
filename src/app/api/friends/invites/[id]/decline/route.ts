import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { declineInvite } from "@/modules/friends";

/** POST /api/friends/invites/:id/decline. Owner: friends. */
export const POST = apiRoute(async (req, ctx: RouteContext<"/api/friends/invites/[id]/decline">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  return declineInvite(user, id);
});
