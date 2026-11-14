import { RecommendBody } from "@/shared/contracts";
import { apiRoute, parseBody } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { recommendStudySpot } from "@/modules/recommend";

/** POST /api/recommend : { origin, prefs } -> { placeId, reason, alternatives, source }. Owner: recommend. */
export const POST = apiRoute(async (req) => {
  const user = await requireUser(req);
  const body = await parseBody(req, RecommendBody);
  return recommendStudySpot(user.id, body);
});
