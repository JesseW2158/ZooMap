import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { leaveActivity } from "@/modules/activities";

/**
 * POST /api/activities/:id/leave : { participation, activity } with the final verified time.
 * A host who leaves ends the activity. Owner: activities.
 */
export const POST = apiRoute(async (req, ctx: RouteContext<"/api/activities/[id]/leave">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  return leaveActivity(user, id);
});
