import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { listStoreItems } from "@/modules/rewards";

/** GET /api/store/items : the mock catalog, cheapest first. Owner: rewards. */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  return listStoreItems();
});
