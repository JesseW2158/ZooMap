"use client";

import { DeviceTokenResponse } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import { PREF_KEYS, nativePrefs, type KeyValueStore } from "./prefs";

/**
 * The device token lets the background pinger authenticate without the WebView's cookies
 * (it sends pings with native HTTP and an `Authorization: Bearer` header). The server shows it
 * once and keeps only its SHA-256, so it lives in Preferences. A 401 on a ping means the server no
 * longer knows it (sign-out deletes it): the tracker removes it and this fetches a new one the
 * next time the signed-in app is in the foreground.
 */

/** Ask the server for a token. Uses the session cookie, so it works only while signed in. */
async function issueToken(): Promise<string> {
  const { token } = await apiFetch("/api/mobile/device-token", { method: "POST", schema: DeviceTokenResponse });
  return token;
}

let inflight: Promise<boolean> | null = null;

/**
 * Make sure Preferences holds a device token. Resolves true when one is stored, false when none
 * could be fetched (signed out, offline); the caller tries again later.
 */
export function ensureDeviceToken(store: KeyValueStore = nativePrefs, issue: () => Promise<string> = issueToken): Promise<boolean> {
  if (store === nativePrefs && inflight) return inflight;
  const run = (async () => {
    try {
      if (await store.get(PREF_KEYS.deviceToken)) return true;
      await store.set(PREF_KEYS.deviceToken, await issue());
      return true;
    } catch {
      return false;
    }
  })();
  if (store === nativePrefs) {
    inflight = run;
    void run.finally(() => {
      inflight = null;
    });
  }
  return run;
}
