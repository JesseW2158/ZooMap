import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { getGround } from "@/modules/campus";

/** GET /api/campus/ground : display-only GeoJSON (paths, roads, grass, water). Added by Foundation; owner: campus map. */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  return getGround();
});
