import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { fixtures } from "@/modules/activities";

/**
 * POST /api/activities/:id/end : the ended Activity. Host only (403 FORBIDDEN otherwise).
 * Owner: activities. FOUNDATION STUB: ends nothing.
 */
export const POST = apiRoute(async (req, ctx: RouteContext<"/api/activities/[id]/end">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const { activity } = fixtures.participationResultFixture(id, user.id, new Date());
  return { ...activity, status: "ended" as const, endedAt: new Date().toISOString() };
});
