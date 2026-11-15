import { NextResponse } from "next/server";
import { createHandoffCode, getSessionUser, isValidChallenge } from "@/modules/auth";

/**
 * /auth/mobile/done?challenge=C : the last step in the Custom Tab.
 *
 * GET never mints anything. A link to /auth/mobile/start would otherwise let any app that can
 * register `zoomap://` (or any page the victim visits) get a code for the victim's session bound
 * to the attacker's own challenge. GET only shows who is signed in and asks; the button POSTs
 * back here, and only that POST makes the one-time code and answers with a page that opens
 * `zoomap://auth?code=...` (Chrome may refuse a plain server redirect to a custom scheme).
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const challenge = url.searchParams.get("challenge");
  if (!isValidChallenge(challenge)) return invalidLink();

  const user = await getSessionUser();
  if (!user) return redirectToStart(url, challenge);

  return html(
    200,
    "Open MinuteMap",
    `<p>Open the MinuteMap app signed in as <strong>${escapeHtml(user.email)}</strong>?</p>
<form method="post" action="/auth/mobile/done?challenge=${challenge}"><button type="submit">Continue</button></form>`,
  );
}

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const challenge = url.searchParams.get("challenge");
  if (!isValidChallenge(challenge)) return invalidLink();
  if (!sameOrigin(req)) return html(403, "Not allowed", `<p>This request did not come from the MinuteMap sign-in page.</p>`);

  const user = await getSessionUser();
  if (!user) return redirectToStart(url, challenge, 303);

  const code = await createHandoffCode(user.id, challenge);
  const link = `zoomap://auth?code=${code}`; // base64url: nothing to escape
  return html(
    200,
    "Return to MinuteMap",
    `<p>You are signed in. Opening MinuteMap&hellip;</p>
<p><a href="${link}">Return to MinuteMap</a></p>
<script>location.replace(${JSON.stringify(link)});</script>`,
  );
}

/**
 * Same-origin POSTs only. Browsers state this in `Sec-Fetch-Site` (a page cannot forge it); where it
 * is missing, fall back to the `Origin` header naming this host, as Next does for server actions.
 */
function sameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function redirectToStart(url: URL, challenge: string, status = 307): Response {
  const start = new URL("/auth/mobile/start", url);
  start.searchParams.set("challenge", challenge);
  const res = NextResponse.redirect(start, status);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function invalidLink(): Response {
  return html(400, "Invalid sign-in link", `<p>This sign-in link is not valid. Go back to the MinuteMap app and try again.</p>`);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function html(status: number, title: string, body: string): Response {
  const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="same-origin"><title>${title} · MinuteMap</title>
<style>body{font-family:system-ui,sans-serif;margin:0;min-height:100dvh;display:flex;flex-direction:column;justify-content:center;gap:1rem;padding:1.5rem;max-width:24rem;margin-inline:auto}
a,button{display:block;width:100%;box-sizing:border-box;text-align:center;background:#171717;color:#fff;padding:.9rem 1rem;border:0;border-radius:.75rem;text-decoration:none;font:inherit;font-weight:600}</style>
</head><body><h1 style="display:flex;align-items:center;gap:.75rem;margin:0"><img src="/logo/minute-map-circle-512.png" alt="" width="40" height="40">MinuteMap</h1>${body}</body></html>`;
  return new Response(page, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "same-origin" },
  });
}
