import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { getDensitySnapshot } from "@/modules/density";

/** GET /api/density : the heatmap snapshot. Simulated data is labelled in the body. Owner: density. */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  return getDensitySnapshot();
});
