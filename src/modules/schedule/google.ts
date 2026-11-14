import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/shared/config/env";
import { ApiError } from "@/shared/http";

/**
 * Calendar-only Google OAuth, separate from sign-in: scope `calendar.readonly` with offline
 * access, so sign-in keeps working even if UMass blocks the calendar scope. Plain fetch
 * against Google's documented endpoints; no client library.
 */

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const STATE_TTL_MS = 10 * 60_000;

/** The refresh token was revoked or expired: the user must connect again. */
export class GoogleRevokedError extends Error {
  constructor() {
    super("Google Calendar access was removed. Connect it again.");
    this.name = "GoogleRevokedError";
  }
}

function credentials() {
  const { googleClientId, googleClientSecret } = env();
  if (!googleClientId || !googleClientSecret) throw new ApiError("NOT_CONFIGURED", "Google Calendar is not set up on this server");
  return { clientId: googleClientId, clientSecret: googleClientSecret };
}

function stateKey(secret = process.env.AUTH_SECRET): Buffer {
  if (!secret) throw new ApiError("NOT_CONFIGURED", "AUTH_SECRET is not set");
  return createHmac("sha256", secret).update("zoomap:schedule:google-state").digest();
}

/** `state` = userId.expiry.nonce.signature: ties the callback to the user who started it. */
export function signState(userId: string, now = Date.now(), secret?: string): string {
  const payload = `${Buffer.from(userId).toString("base64url")}.${now + STATE_TTL_MS}.${randomBytes(9).toString("base64url")}`;
  const sig = createHmac("sha256", stateKey(secret)).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** True when `state` was signed by us, is unexpired and belongs to `userId`. */
export function verifyState(state: string, userId: string, now = Date.now(), secret?: string): boolean {
  const parts = state.split(".");
  if (parts.length !== 4) return false;
  const [uid, exp, nonce, sig] = parts;
  const expected = createHmac("sha256", stateKey(secret)).update(`${uid}.${exp}.${nonce}`).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  if (!(Number(exp) > now)) return false;
  return Buffer.from(uid, "base64url").toString() === userId;
}

export function authUrl(state: string, redirectUri: string): string {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    // always ask, so Google returns a refresh token even on a second connect
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeCode(code: string, redirectUri: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const { clientId, clientSecret } = credentials();
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const json = (await res.json().catch(() => ({}))) as { refresh_token?: string; error?: string };
  if (!res.ok || !json.refresh_token) throw new ApiError("UNPROCESSABLE", "Google did not grant calendar access");
  return json.refresh_token;
}

async function accessToken(refreshToken: string, fetchImpl: typeof fetch): Promise<string> {
  const { clientId, clientSecret } = credentials();
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (json.error === "invalid_grant") throw new GoogleRevokedError();
  if (!res.ok || !json.access_token) throw new Error(`Google token refresh failed (${res.status})`);
  return json.access_token;
}

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

/** Events on the user's primary calendar in [from, to], recurring ones expanded by Google. */
export async function fetchGoogleEvents(refreshToken: string, from: Date, to: Date, fetchImpl: typeof fetch = fetch): Promise<GoogleEvent[]> {
  const token = await accessToken(refreshToken, fetchImpl);
  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetchImpl(`${EVENTS_URL}?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) });
  if (res.status === 401) throw new GoogleRevokedError();
  if (!res.ok) throw new Error(`Google Calendar answered ${res.status}`);
  const json = (await res.json()) as { items?: GoogleEvent[] };
  return (json.items ?? []).filter((e) => e.status !== "cancelled");
}
