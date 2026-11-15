import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { getGround } from "@/modules/campus";
import { cachedJson } from "../cache";

/** GET /api/campus/ground : display-only GeoJSON (paths, roads, grass, water). Cached privately with an ETag. Owner: campus map. */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  return cachedJson(req, await getGround());
});
