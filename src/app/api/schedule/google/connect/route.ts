import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";

/**
 * GET /api/schedule/google/connect : starts the calendar-only OAuth flow (a redirect to
 * Google with `calendar.readonly` and offline access). Open it with `openExternalAuth`.
 * Owner: schedule. FOUNDATION STUB: redirects straight home.
 */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  return Response.redirect(new URL("/?schedule=google-stub", req.url), 302);
});
