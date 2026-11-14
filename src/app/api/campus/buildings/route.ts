import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { getBuildings } from "@/modules/campus";

/** GET /api/campus/buildings : GeoJSON for the 3D layer. Added by Foundation; owner: campus map. */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  return getBuildings();
});
