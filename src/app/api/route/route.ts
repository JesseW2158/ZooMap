import { RouteQuery } from "@/shared/contracts";
import { apiRoute, parseQuery } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { findRoute } from "@/modules/routing";

/** GET /api/route?to=&fromLat=&fromLng= or &fromPlaceId= : { line, distanceM, durationS }. Owner: routing. */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  const q = parseQuery(req, RouteQuery);
  const from = q.fromPlaceId !== undefined ? { placeId: q.fromPlaceId } : { lat: q.fromLat as number, lng: q.fromLng as number };
  return findRoute({ from, to: { placeId: q.to } });
});
