/**
 * Fetching a user-supplied calendar URL. The server must not become a proxy to arbitrary
 * hosts, so: https only, no credentials in the URL, default port, host on the allowlist
 * (a leading dot matches subdomains), every redirect re-checked, 5 s timeout, 2 MB cap.
 */

export const FEED_TIMEOUT_MS = 5_000;
export const FEED_MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export class FeedError extends Error {
  /** Safe to show the user; never includes the URL (it is a credential). */
  constructor(message: string) {
    super(message);
    this.name = "FeedError";
  }
}

export function hostAllowed(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return allowed.some((entry) => {
    const e = entry.trim().toLowerCase();
    if (!e) return false;
    return e.startsWith(".") ? h.endsWith(e) || h === e.slice(1) : h === e;
  });
}

/** Why `url` may not be fetched, or null when it may. */
export function urlProblem(url: string | URL, allowed: string[]): string | null {
  let u: URL;
  try {
    u = typeof url === "string" ? new URL(url.trim().replace(/^webcal:/i, "https:")) : url;
  } catch {
    return "That is not a valid link";
  }
  if (u.protocol !== "https:") return "The link must start with https://";
  if (u.username || u.password) return "The link must not contain a user name or password";
  if (u.port && u.port !== "443") return "The link must use the standard https port";
  if (!hostAllowed(u.hostname, allowed)) return `Links from ${u.hostname} are not supported. Use a Canvas or Google Calendar link.`;
  return null;
}

/** Canvas shows `webcal://` links; they are the same feed over https. */
export function normalizeFeedUrl(url: string): string {
  return url.trim().replace(/^webcal:/i, "https:");
}

export async function fetchFeed(
  url: string,
  allowed: string[],
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; maxBytes?: number } = {},
): Promise<string> {
  const { fetchImpl = fetch, timeoutMs = FEED_TIMEOUT_MS, maxBytes = FEED_MAX_BYTES } = opts;
  const signal = AbortSignal.timeout(timeoutMs);
  let current = new URL(normalizeFeedUrl(url));
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const problem = urlProblem(current, allowed);
    if (problem) throw new FeedError(hop === 0 ? problem : "The calendar link redirected somewhere that is not allowed");
    let res: Response;
    try {
      res = await fetchImpl(current, { redirect: "manual", signal, headers: { Accept: "text/calendar, */*;q=0.5" } });
    } catch {
      throw new FeedError(signal.aborted ? "The calendar took too long to answer" : "Could not reach the calendar");
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new FeedError("The calendar link redirected nowhere");
      current = new URL(location, current);
      continue;
    }
    if (!res.ok) throw new FeedError(res.status === 404 || res.status === 401 ? "The calendar link no longer works. Copy it again from Canvas." : `The calendar answered ${res.status}`);
    return readCapped(res, maxBytes);
  }
  throw new FeedError("The calendar link redirected too many times");
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new FeedError("The calendar is too large");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FeedError("The calendar is too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
