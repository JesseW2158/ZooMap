import { CreatePlannedEventBody } from "@/shared/contracts";
import { apiRoute, parseBody } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { createPlannedEvent, listPlannedEvents } from "@/modules/planned";

/** GET /api/planned-events : events coming up, soonest first. Owner: notifications. */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  return listPlannedEvents(user.id);
});

/** POST /api/planned-events : announce an event ahead of time. Owner: notifications. */
export const POST = apiRoute(
  async (req) => {
    const user = await requireUser(req);
    return createPlannedEvent(user, await parseBody(req, CreatePlannedEventBody));
  },
  { status: 201 },
);
