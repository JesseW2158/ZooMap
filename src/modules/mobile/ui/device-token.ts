"use client";

import { DeviceTokenResponse } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import { PREF_KEYS, nativePrefs, type KeyValueStore } from "./prefs";
import { readStoredToken, serializeStoredToken } from "./stored-token";
import { getTracker } from "./tracking";

/**
 * The device token lets the background pinger authenticate without the WebView's cookies
 * (it sends pings with native HTTP and an `Authorization: Bearer` header). The server shows it
 * once and keeps only its SHA-256, so it lives in Preferences, together with the id of the user
 * it was issued for.
 *
 * The server deletes tokens on an explicit sign-out only, not when a session expires or cookies
 * are cleared. So a token can outlive its owner's session, and if someone else signs in on this
 * phone, pings with the old token would be credited to the first user. Hence `ensureDeviceToken`
 * compares the stored user id with the current session's and replaces a token that does not match.
 * A 401 on a ping still removes the token (the tracker does that); this fetches a new one the next
 * time the signed-in app is in the foreground.
 */

export interface DeviceTokenDeps {
  /** The signed-in user's id from the session, or null when there is no session (or no network). */
  sessionUserId(): Promise<string | null>;
  /** Ask the server for a token. Uses the session cookie. */
  issue(): Promise<string>;
  /** Stop native tracking, so nothing keeps pinging with a token that is being replaced. */
  stopTracking(): Promise<void>;
}

/** The id of the signed-in user: `user.id` in the Auth.js session (set by the session callback). */
async function fetchSessionUserId(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { user?: { id?: unknown } } | null;
    const id = json?.user?.id;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

async function issueToken(): Promise<string> {
  const { token } = await apiFetch("/api/mobile/device-token", { method: "POST", schema: DeviceTokenResponse });
  return token;
}

const nativeDeps: DeviceTokenDeps = {
  sessionUserId: fetchSessionUserId,
  issue: issueToken,
  stopTracking: () => getTracker().setMode("off"),
};

/** Forget the stored token and stop tracking (used before another sign-in starts). */
export async function resetDeviceToken(store: KeyValueStore = nativePrefs, stopTracking: () => Promise<void> = nativeDeps.stopTracking): Promise<void> {
  await stopTracking().catch(() => {});
  await store.remove(PREF_KEYS.deviceToken);
}

let inflight: Promise<boolean> | null = null;

/**
 * Make sure Preferences holds a device token for the user who is signed in now. Resolves true when
 * it does, false when there is no session or none could be fetched (signed out, offline); the
 * caller tries again later. With no session this does nothing at all.
 */
export function ensureDeviceToken(store?: KeyValueStore, deps?: DeviceTokenDeps): Promise<boolean> {
  const isDefault = !store && !deps;
  if (isDefault && inflight) return inflight;
  const run = ensure(store ?? nativePrefs, deps ?? nativeDeps);
  if (isDefault) {
    inflight = run;
    void run.finally(() => {
      inflight = null;
    });
  }
  return run;
}

async function ensure(store: KeyValueStore, deps: DeviceTokenDeps): Promise<boolean> {
  try {
    const userId = await deps.sessionUserId();
    if (!userId) return false;

    const stored = await readStoredToken(store);
    if (stored?.userId === userId) return true;

    if (stored) {
      // issued for someone else, or a legacy bare string: stop using it before replacing it
      await deps.stopTracking().catch(() => {});
      await store.remove(PREF_KEYS.deviceToken);
    }
    await store.set(PREF_KEYS.deviceToken, serializeStoredToken(await deps.issue(), userId));
    return true;
  } catch {
    return false;
  }
}
