import { PingBody } from "@/shared/contracts";
import { apiRoute, parseBody } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { nearestPlace } from "@/modules/campus";

/**
 * POST /api/presence/ping : { lat, lng, accuracyM? }. Cookie or device token. Owner: density.
 * FOUNDATION STUB: stores nothing, emits nothing. The real handler refuses with 403 SHARING_OFF
 * when sharing is off, upserts the one presence document (cell and place only, never
 * coordinates) and emits `presence.updated`.
 */
export const POST = apiRoute(async (req) => {
  await requireUser(req);
  const body = await parseBody(req, PingBody);
  const near = await nearestPlace({ lat: body.lat, lng: body.lng }, 60);
  return { placeId: near?.place.id ?? null, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() };
});
