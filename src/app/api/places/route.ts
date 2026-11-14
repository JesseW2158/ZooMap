import { PlacesQuery } from "@/shared/contracts";
import { apiRoute, parseQuery } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { searchPlaces } from "@/modules/campus";

/** GET /api/places?q= : up to ten places by name or alias. Owner: routing. */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  const { q } = parseQuery(req, PlacesQuery);
  return searchPlaces(q, 10);
});
