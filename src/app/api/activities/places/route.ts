import { ActivityPlacesQuery } from "@/shared/contracts";
import { apiRoute, parseQuery } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { suggestPlaces } from "@/modules/activities";

/** GET /api/activities/places?placeId=&lat=&lng= : places for the host form, that place first then the nearest. Owner: activities. */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  return suggestPlaces(parseQuery(req, ActivityPlacesQuery));
});
