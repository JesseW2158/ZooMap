import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { fixtures } from "@/modules/activities";

/**
 * POST /api/activities/:id/leave : { participation, activity } with the final verified time.
 * Owner: activities. FOUNDATION STUB: leaves nothing and emits no `participation.ended`.
 */
export const POST = apiRoute(async (req, ctx: RouteContext<"/api/activities/[id]/leave">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const result = fixtures.participationResultFixture(id, user.id, new Date());
  return { ...result, participation: { ...result.participation, status: "ended" as const, verifying: false } };
});
