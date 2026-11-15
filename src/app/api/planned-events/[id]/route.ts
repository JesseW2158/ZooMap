import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { cancelPlannedEvent } from "@/modules/planned";

/** DELETE /api/planned-events/:id : the host cancels their event. Owner: notifications. */
export const DELETE = apiRoute(async (req, ctx: RouteContext<"/api/planned-events/[id]">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  await cancelPlannedEvent(user, id);
  return { ok: true as const };
});
