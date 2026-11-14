import { PlacesQuery } from "@/shared/contracts";
import { apiRoute, parseQuery } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { getPlace, searchPlaces } from "@/modules/campus";

/** GET /api/places?q= : up to ten places by name or alias; ?id= : that one place, or []. Owner: routing. */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  const { q, id } = parseQuery(req, PlacesQuery);
  if (id) {
    const place = await getPlace(id);
    return place ? [place] : [];
  }
  return searchPlaces(q, 10);
});
