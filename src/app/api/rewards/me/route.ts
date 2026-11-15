import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { getRewardsMe } from "@/modules/rewards";

/** GET /api/rewards/me : { balance, entries, redemptions }, newest first. Owner: rewards. */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  return getRewardsMe(user.id);
});
