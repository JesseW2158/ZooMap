"use client";

import { PREF_KEYS, nativePrefs, type KeyValueStore } from "./prefs";

/**
 * Sign-in handoff. Google refuses OAuth inside a WebView, so sign-in runs in a Custom Tab:
 *
 *   1. startHandoff()   makes a verifier, keeps it in Preferences (the Activity may be recreated
 *                       while the tab is open), and opens /auth/mobile/start?challenge=SHA256(verifier).
 *   2. The tab ends at  zoomap://auth?code=...  and Android hands that link to this app.
 *   3. consumeReturnUrl() closes the tab and loads /auth/mobile/finish?code=...&verifier=... in
 *                       the WebView; the server checks the pair, signs the WebView in, redirects to "/".
 */

export interface HandoffDeps {
  store: KeyValueStore;
  openBrowser(url: string): Promise<void>;
  closeBrowser(): Promise<void>;
  /** Load a path in the WebView. */
  navigate(path: string): void;
  origin(): string;
  randomBytes(length: number): Uint8Array;
}

export function nativeHandoffDeps(): HandoffDeps {
  return {
    store: nativePrefs,
    async openBrowser(url) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
    },
    async closeBrowser() {
      const { Browser } = await import("@capacitor/browser");
      await Browser.close();
    },
    navigate: (path) => window.location.assign(path),
    origin: () => window.location.origin,
    randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
  };
}

/** base64url without padding. */
export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 32 random bytes, base64url, no padding (43 characters). */
export function generateVerifier(randomBytes: (length: number) => Uint8Array): string {
  return base64Url(randomBytes(32));
}

/** base64url(SHA-256(verifier)), no padding. The server stores this and compares at /finish. */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** The code from `zoomap://auth?code=...`, or null for any other URL. */
export function parseReturnUrl(url: string): { code: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "zoomap:" || parsed.hostname !== "auth") return null;
  const code = parsed.searchParams.get("code");
  return code ? { code } : null;
}

export function startUrl(origin: string, challenge: string): string {
  return `${origin}/auth/mobile/start?challenge=${encodeURIComponent(challenge)}`;
}

export function finishPath(code: string, verifier: string): string {
  return `/auth/mobile/finish?code=${encodeURIComponent(code)}&verifier=${encodeURIComponent(verifier)}`;
}

/** Open the system browser for sign-in. The verifier is saved before the tab opens. */
export async function startHandoff(deps: HandoffDeps = nativeHandoffDeps()): Promise<void> {
  const verifier = generateVerifier(deps.randomBytes);
  const challenge = await challengeFor(verifier);
  await deps.store.set(PREF_KEYS.handoffVerifier, verifier);
  await deps.openBrowser(startUrl(deps.origin(), challenge));
}

export type ConsumeResult = "finished" | "ignored" | "failed";

/**
 * Handle a link the app was opened with. Anything that is not a handoff return is ignored.
 * A code is finished once: `getLaunchUrl()` keeps returning the cold-start link for the life of
 * the process, so the last finished code is remembered and replays are dropped.
 */
export async function consumeReturnUrl(url: string, deps: HandoffDeps = nativeHandoffDeps()): Promise<ConsumeResult> {
  const parsed = parseReturnUrl(url);
  if (!parsed) return "ignored";
  const { code } = parsed;

  if ((await deps.store.get(PREF_KEYS.handoffLastCode)) === code) return "ignored";

  await deps.closeBrowser().catch(() => {});

  const verifier = await deps.store.get(PREF_KEYS.handoffVerifier);
  if (!verifier) {
    deps.navigate("/signin?error=handoff");
    return "failed";
  }
  await deps.store.remove(PREF_KEYS.handoffVerifier);
  await deps.store.set(PREF_KEYS.handoffLastCode, code);
  deps.navigate(finishPath(code, verifier));
  return "finished";
}

let installed = false;

/**
 * Listen for the return link for the life of this page: `appUrlOpen` covers a running app,
 * `getLaunchUrl` a cold start (the Activity was killed while the tab was open). Idempotent.
 */
export function installReturnListener(deps: HandoffDeps = nativeHandoffDeps()): void {
  if (installed) return;
  installed = true;
  void (async () => {
    try {
      const { App } = await import("@capacitor/app");
      await App.addListener("appUrlOpen", (event) => {
        void consumeReturnUrl(event.url, deps);
      });
      const launch = await App.getLaunchUrl();
      if (launch?.url) await consumeReturnUrl(launch.url, deps);
    } catch (cause) {
      installed = false;
      console.warn("[zoomap-native] could not listen for the sign-in return link", cause);
    }
  })();
}
