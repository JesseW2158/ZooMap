import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { removeFriend } from "@/modules/friends";

/** DELETE /api/friends/:id : unfriend (for both people). Owner: friends. */
export const DELETE = apiRoute(async (req, ctx: RouteContext<"/api/friends/[id]">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  return removeFriend(user.id, id);
});
