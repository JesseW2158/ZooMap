import { CreateConnectionBody, DeleteConnectionQuery } from "@/shared/contracts";
import { apiRoute, parseBody, parseQuery } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { createConnection, deleteConnection, listConnections } from "@/modules/schedule";

/**
 * Calendar connections and hand-entered classes. Secrets (feed URL, refresh token) are never
 * returned. Owner: schedule.
 *   GET    -> ScheduleConnection[]
 *   POST   -> 201 ScheduleConnection   body { provider: "ics", label, url } | { provider: "manual", label, placeId?, room?, days, start, end }
 *   DELETE -> { ok: true }             query ?id=
 */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  return listConnections(user.id);
});

export const POST = apiRoute(
  async (req) => {
    const user = await requireUser(req);
    const body = await parseBody(req, CreateConnectionBody);
    return createConnection(user.id, body);
  },
  { status: 201 },
);

export const DELETE = apiRoute(async (req) => {
  const user = await requireUser(req);
  const { id } = parseQuery(req, DeleteConnectionQuery);
  await deleteConnection(user.id, id);
  return { ok: true };
});
