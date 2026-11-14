import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { endActivityAsHost } from "@/modules/activities";

/** POST /api/activities/:id/end : the ended Activity. Host only (403 FORBIDDEN otherwise). Owner: activities. */
export const POST = apiRoute(async (req, ctx: RouteContext<"/api/activities/[id]/end">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  return endActivityAsHost(user, id);
});
