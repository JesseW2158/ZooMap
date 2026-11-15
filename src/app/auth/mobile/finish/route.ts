import { NextResponse } from "next/server";
import { signIn } from "@/modules/auth";

/**
 * GET /auth/mobile/finish?code=&verifier= : loaded in the app's WebView. Signs it in through the
 * `handoff` credentials provider, which spends the one-time code, then goes to the app. Any
 * failure, or a request not made from a page on this site, goes to /signin?error=Handoff. A route handler because it sets the session cookie.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const verifier = url.searchParams.get("verifier");
  const fail = () => noStore(NextResponse.redirect(new URL("/signin?error=Handoff", url)));
  // Login CSRF: only a navigation started by a page on this site (the app's own `location.assign`)
  // may sign the WebView in. Checked before the code is touched, so a refused request spends nothing.
  if (req.headers.get("sec-fetch-site") !== "same-origin") return fail();
  if (!code || !verifier) return fail();

  let result: string;
  try {
    // redirect:false returns the URL Auth.js would have gone to; a failed sign-in carries `error=`.
    result = await signIn("handoff", { code, verifier, redirect: false, redirectTo: "/" });
  } catch {
    return fail();
  }
  if (new URL(result, url).searchParams.has("error")) return fail();

  return noStore(NextResponse.redirect(new URL("/", url)));
}

function noStore<T extends Response>(res: T): T {
  res.headers.set("Cache-Control", "no-store");
  return res;
}
