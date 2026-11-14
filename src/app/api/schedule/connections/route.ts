import { CreateConnectionBody, DeleteConnectionQuery } from "@/shared/contracts";
import { apiRoute, parseBody, parseQuery } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { fixtures } from "@/modules/schedule";

/**
 * Calendar connections. Secrets (feed URL, refresh token) are never returned. Owner: schedule.
 * FOUNDATION STUB: stores nothing.
 *   GET    -> ScheduleConnection[]
 *   POST   -> 201 ScheduleConnection   body { provider: "ics", label, url }
 *   DELETE -> { ok: true }             query ?id=
 */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  return fixtures.connectionsFixture;
});

export const POST = apiRoute(
  async (req) => {
    await requireUser(req);
    const body = await parseBody(req, CreateConnectionBody);
    return { id: "fixture-connection-new", provider: body.provider, label: body.label };
  },
  { status: 201 },
);

export const DELETE = apiRoute(async (req) => {
  await requireUser(req);
  parseQuery(req, DeleteConnectionQuery);
  return { ok: true };
});
