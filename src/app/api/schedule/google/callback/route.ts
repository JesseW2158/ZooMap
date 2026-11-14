import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { googleExchangeCode, saveGoogleConnection, verifyGoogleState } from "@/modules/schedule";

/**
 * GET /api/schedule/google/callback : Google's redirect target. Verifies the signed `state`
 * against the signed-in user, stores the encrypted refresh token, redirects home with
 * `?schedule=google-connected` (or `google-denied` / `google-error`). Owner: schedule.
 */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  const url = new URL(req.url);
  const home = (status: string) => Response.redirect(`${url.origin}/?schedule=${status}`, 302);
  if (url.searchParams.get("error")) return home("google-denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !verifyGoogleState(state, user.id)) return home("google-error");
  try {
    const refreshToken = await googleExchangeCode(code, `${url.origin}/api/schedule/google/callback`);
    await saveGoogleConnection(user.id, refreshToken);
    return home("google-connected");
  } catch {
    return home("google-error");
  }
});
