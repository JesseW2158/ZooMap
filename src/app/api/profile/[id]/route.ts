import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { getProfile } from "@/modules/friends";

/** GET /api/profile/:id : your own or a friend's profile; anyone else is 404. Owner: friends. */
export const GET = apiRoute(async (req, ctx: RouteContext<"/api/profile/[id]">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  return getProfile(user.id, id);
});
