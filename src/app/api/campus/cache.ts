import { createHash } from "node:crypto";

/**
 * Caching for the static campus GeoJSON. The files in `data/campus/` change only when a new
 * build is deployed, so a body is serialised and hashed once per server instance and every
 * later request reuses it.
 *
 * `private`, not `public`: the routes require a signed-in user, and a shared cache (the CDN)
 * must not hand an authenticated response to someone who never authenticated. The browser
 * still caches it for an hour and then revalidates with the ETag, so a repeat visit costs a
 * 304 instead of 0.5 to 1.3 MB.
 */
export const CAMPUS_CACHE_CONTROL = "private, max-age=3600, stale-while-revalidate=86400";

interface Cached {
  body: string;
  etag: string;
}

const cache = new WeakMap<object, Cached>();

function entryFor(data: object): Cached {
  let entry = cache.get(data);
  if (!entry) {
    const body = JSON.stringify(data);
    entry = { body, etag: `"${createHash("sha1").update(body).digest("base64url")}"` };
    cache.set(data, entry);
  }
  return entry;
}

/** True when an `If-None-Match` header lists `etag` (or `*`). Weak validators compare equal. */
export function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((v) => {
    const tag = v.trim().replace(/^W\//, "");
    return tag === "*" || tag === etag;
  });
}

/** JSON response with Cache-Control and ETag; 304 when the client already has this version. */
export function cachedJson(req: Request, data: object): Response {
  const { body, etag } = entryFor(data);
  const headers = {
    "Cache-Control": CAMPUS_CACHE_CONTROL,
    ETag: etag,
    Vary: "Cookie, Authorization",
  };
  if (etagMatches(req.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });
  return new Response(body, { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
}
