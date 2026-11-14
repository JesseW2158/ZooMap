import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { joinActivity } from "@/modules/activities";

/**
 * POST /api/activities/:id/join : { participation, activity }. Owner: activities.
 * 409 ALREADY_IN_ACTIVITY, 409 CAPACITY_FULL, 409 ACTIVITY_ENDED, 404 NOT_FOUND.
 */
export const POST = apiRoute(async (req, ctx: RouteContext<"/api/activities/[id]/join">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  return joinActivity(user, id);
});
