import { SharingBody } from "@/shared/contracts";
import { apiRoute, parseBody } from "@/shared/http";
import { requireUser } from "@/modules/auth";

/**
 * GET /api/presence/sharing : { enabled } (added by Foundation so a client can read the flag).
 * PUT /api/presence/sharing : { enabled } turns sharing on or off; off deletes the presence
 * document. Owner: density. FOUNDATION STUB: remembers nothing.
 */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  return { enabled: false };
});

export const PUT = apiRoute(async (req) => {
  await requireUser(req);
  const { enabled } = await parseBody(req, SharingBody);
  return { enabled };
});
