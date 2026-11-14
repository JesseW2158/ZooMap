import { CreateActivityBody } from "@/shared/contracts";
import { apiRoute, parseBody } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { fixtures, listActiveActivities } from "@/modules/activities";

/** GET /api/activities : active activities with participant counts. Owner: activities. */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  return listActiveActivities();
});

/**
 * POST /api/activities : host an activity. Owner: activities.
 * FOUNDATION STUB: creates nothing. The real handler inserts in a transaction and maps the
 * unique-index duplicate-key errors to 409 ALREADY_HOSTING / ALREADY_IN_ACTIVITY.
 */
export const POST = apiRoute(
  async (req) => {
    const user = await requireUser(req);
    const body = await parseBody(req, CreateActivityBody);
    return fixtures.createdActivityFixture(body, { id: user.id, name: user.name ?? user.email }, new Date());
  },
  { status: 201 },
);
