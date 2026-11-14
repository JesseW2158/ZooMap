import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { getActiveParticipation } from "@/modules/activities";

/** GET /api/activities/me : { participation, activity } with live `verifiedSeconds`. Owner: activities. */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  return getActiveParticipation(user.id);
});
