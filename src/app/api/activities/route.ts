import { CreateActivityBody } from "@/shared/contracts";
import { apiRoute, parseBody } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { createActivity, listActiveActivities } from "@/modules/activities";

/** GET /api/activities : active activities with participant counts. Owner: activities. */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  return listActiveActivities();
});

/** POST /api/activities : host an activity. 409 ALREADY_HOSTING / ALREADY_IN_ACTIVITY. Owner: activities. */
export const POST = apiRoute(
  async (req) => {
    const user = await requireUser(req);
    const body = await parseBody(req, CreateActivityBody);
    return createActivity(user, body);
  },
  { status: 201 },
);
