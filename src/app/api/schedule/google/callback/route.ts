import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";

/**
 * GET /api/schedule/google/callback : Google's redirect target. Verifies the signed `state`
 * against the signed-in user, stores the encrypted refresh token, redirects home.
 * Owner: schedule. FOUNDATION STUB: redirects straight home.
 */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  return Response.redirect(new URL("/?schedule=google-stub", req.url), 302);
});
