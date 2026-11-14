import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { fixtures, getBalance } from "@/modules/rewards";

/** GET /api/rewards/me : { balance, entries, redemptions }. Owner: rewards. */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  return fixtures.rewardsMeFixture(await getBalance(user.id), new Date());
});
