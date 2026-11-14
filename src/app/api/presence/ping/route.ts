import { PingBody } from "@/shared/contracts";
import { apiRoute, parseBody } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { recordPing } from "@/modules/density";

/**
 * POST /api/presence/ping : { lat, lng, accuracyM? }. Cookie or device token. Owner: density.
 * 403 SHARING_OFF when the user has not opted in. Stores the cell and place only.
 */
export const POST = apiRoute(async (req) => {
  const user = await requireUser(req);
  const body = await parseBody(req, PingBody);
  const { placeId, expiresAt } = await recordPing(user.id, { lat: body.lat, lng: body.lng }, user.via === "device" ? "native" : "web");
  return { placeId, expiresAt: expiresAt.toISOString() };
});
