import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { fixtures } from "@/modules/rewards";

/** GET /api/store/items : the mock catalog. Owner: rewards. */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  return fixtures.storeItemsFixture;
});
