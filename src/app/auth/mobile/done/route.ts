import { NextResponse } from "next/server";
import { createHandoffCode, getSessionUser, isValidChallenge } from "@/modules/auth";

/**
 * GET /auth/mobile/done?challenge=C : the last step in the Custom Tab. A route handler, not a
 * page, because it has a side effect (it mints a one-time code). Needs a session; without one
 * it goes back to /auth/mobile/start. Answers with a page that opens `zoomap://auth?code=...`,
 * since Chrome may refuse a server redirect to a custom scheme that no tap led to.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const challenge = url.searchParams.get("challenge");
  if (!isValidChallenge(challenge)) {
    return html(400, "Invalid sign-in link", `<p>This sign-in link is not valid. Go back to the ZooMap app and try again.</p>`);
  }

  const user = await getSessionUser();
  if (!user) {
    const start = new URL("/auth/mobile/start", url);
    start.searchParams.set("challenge", challenge);
    return noStore(NextResponse.redirect(start));
  }

  const code = await createHandoffCode(user.id, challenge);
  const link = `zoomap://auth?code=${code}`; // base64url: nothing to escape
  return html(
    200,
    "Return to ZooMap",
    `<p>You are signed in. Opening ZooMap&hellip;</p>
<p><a href="${link}">Return to ZooMap</a></p>
<script>location.replace(${JSON.stringify(link)});</script>`,
  );
}

function noStore<T extends Response>(res: T): T {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function html(status: number, title: string, body: string): Response {
  const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${title} · ZooMap</title>
<style>body{font-family:system-ui,sans-serif;margin:0;min-height:100dvh;display:flex;flex-direction:column;justify-content:center;gap:1rem;padding:1.5rem;max-width:24rem;margin-inline:auto}
a{display:block;text-align:center;background:#171717;color:#fff;padding:.9rem 1rem;border-radius:.75rem;text-decoration:none;font-weight:600}</style>
</head><body><h1>ZooMap</h1>${body}</body></html>`;
  return new Response(page, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
