import { SharingBody } from "@/shared/contracts";
import { apiRoute, parseBody } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { getSharing, setSharing } from "@/modules/density";

/**
 * GET /api/presence/sharing : { enabled }.
 * PUT /api/presence/sharing : { enabled } turns sharing on or off; off deletes the presence
 * document. Owner: density.
 */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  return { enabled: await getSharing(user.id) };
});

export const PUT = apiRoute(async (req) => {
  const user = await requireUser(req);
  const { enabled } = await parseBody(req, SharingBody);
  return { enabled: await setSharing(user.id, enabled) };
});
