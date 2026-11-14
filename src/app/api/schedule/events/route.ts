import { ScheduleEventsQuery } from "@/shared/contracts";
import { apiRoute, parseQuery } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { getUpcomingEvents } from "@/modules/schedule";

const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60_000;

/** GET /api/schedule/events?from=&to= : merged events, `placeId` where resolved. Defaults to the next 7 days. Owner: schedule. */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  const q = parseQuery(req, ScheduleEventsQuery);
  const from = q.from ? new Date(q.from) : new Date();
  const to = q.to ? new Date(q.to) : new Date(from.getTime() + DEFAULT_WINDOW_MS);
  return getUpcomingEvents(user.id, { from, to });
});
