import { GoingBody } from "@/shared/contracts";
import { apiRoute, parseBody } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { setGoing } from "@/modules/planned";

/** POST /api/planned-events/:id/going { going } : say you are going, or not. Owner: notifications. */
export const POST = apiRoute(async (req, ctx: RouteContext<"/api/planned-events/[id]/going">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const { going } = await parseBody(req, GoingBody);
  return setGoing(user, id, going);
});
