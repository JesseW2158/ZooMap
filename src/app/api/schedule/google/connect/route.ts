import { apiRoute, ApiError } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { googleAuthUrl, signGoogleState } from "@/modules/schedule";

/**
 * GET /api/schedule/google/connect : starts the calendar-only OAuth flow (a redirect to
 * Google with `calendar.readonly` and offline access). Open it with `openExternalAuth`.
 * When Google is not configured on this server, redirects home with `?schedule=google-unavailable`.
 * Owner: schedule.
 */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  const origin = new URL(req.url).origin;
  try {
    const url = googleAuthUrl(signGoogleState(user.id), `${origin}/api/schedule/google/callback`);
    return Response.redirect(url, 302);
  } catch (err) {
    if (err instanceof ApiError && err.code === "NOT_CONFIGURED") return Response.redirect(`${origin}/?schedule=google-unavailable`, 302);
    throw err;
  }
});
