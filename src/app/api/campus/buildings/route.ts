import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { getBuildings } from "@/modules/campus";
import { cachedJson } from "../cache";

/** GET /api/campus/buildings : GeoJSON for the 3D layer. Cached privately with an ETag. Owner: campus map. */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  return cachedJson(req, await getBuildings());
});
