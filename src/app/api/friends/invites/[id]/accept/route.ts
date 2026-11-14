import { AcceptInviteBody } from "@/shared/contracts";
import { apiRoute, parseBody } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { acceptInvite } from "@/modules/friends";

/**
 * POST /api/friends/invites/:id/accept { leaveCurrent? } : join the activity. Join errors pass
 * through (409 ALREADY_IN_ACTIVITY, CAPACITY_FULL, ACTIVITY_ENDED). Owner: friends.
 */
export const POST = apiRoute(async (req, ctx: RouteContext<"/api/friends/invites/[id]/accept">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  return acceptInvite(user, id, await parseBody(req, AcceptInviteBody));
});
