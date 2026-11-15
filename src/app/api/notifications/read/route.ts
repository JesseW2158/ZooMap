import { MarkReadBody } from "@/shared/contracts";
import { apiRoute, parseBody } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { markAlertsRead } from "@/modules/notifications";

/** POST /api/notifications/read { ids } or { all: true } : mark your alerts read. Owner: notifications. */
export const POST = apiRoute(async (req) => {
  const user = await requireUser(req);
  await markAlertsRead(user.id, await parseBody(req, MarkReadBody));
  return { ok: true as const };
});
