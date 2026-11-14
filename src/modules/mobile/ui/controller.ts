"use client";

import { SharingState } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import { ensureDeviceToken } from "./device-token";
import { PREF_KEYS, nativePrefs } from "./prefs";
import { getTracker, locationPermission, openAppSettings, type StopReason } from "./tracking";
import { createStore } from "@/shared/ui/store";

/**
 * Decides what the native tracker should be doing, from four inputs: whether the user has seen
 * the location disclosure, the server's sharing setting, whether the map asked for a location
 * dot, and what the tracker reports back (permission denied, token refused, sharing off).
 * All Android-only: nothing here runs outside the shell, and `MobileBridge` is the only caller.
 *
 * Rules:
 *  - No system permission prompt appears before the disclosure has been accepted.
 *  - Nothing prompts on its own at start-up: with sharing on but permission not yet granted, the
 *    controller waits for the user to press "Allow location".
 *  - Pings (the `sharing` mode, with the foreground-service notification) run only while the
 *    server says sharing is on. A location dot for the map alone uses the `local` mode.
 */

export type Problem = "permission-denied" | "needs-permission" | "no-token" | "error" | null;

export interface ControllerState {
  /** The user accepted the disclosure (stored in Preferences). */
  consent: boolean;
  /** Preferences have been read. */
  ready: boolean;
  /** Show the disclosure dialog. */
  disclosureOpen: boolean;
  /** Show the "Allow all the time" explanation. */
  backgroundOpen: boolean;
  /** The server's setting; null until read. */
  sharing: boolean | null;
  mode: "off" | "local" | "sharing";
  problem: Problem;
}

export const controllerStore = createStore<ControllerState>({
  consent: false,
  ready: false,
  disclosureOpen: false,
  backgroundOpen: false,
  sharing: null,
  mode: "off",
  problem: null,
});

const tracker = getTracker();
const log = (message: string) => console.log(`[zoomap-native] ${message}`);

/** The map (via `startLocation`) asked for a location dot. */
let localRequested = false;
/** Reconciles run one after another. */
let chain: Promise<void> = Promise.resolve();

function stoppedBecause(reason: StopReason) {
  log(`tracking stopped: ${reason}`);
  switch (reason) {
    case "sharing-off":
      controllerStore.set({ sharing: false, mode: "off" });
      break;
    case "permission-denied":
      controllerStore.set({ mode: "off", problem: "permission-denied" });
      break;
    case "unauthorized":
      // the token is already deleted; the next foreground reconcile fetches a new one
      controllerStore.set({ mode: "off" });
      break;
    default:
      controllerStore.set({ mode: "off", problem: "error" });
  }
  // sharing off can still leave a map location dot to restore. A refused token waits for the next
  // foreground poll instead, so a server that keeps refusing cannot make this loop.
  if (reason === "sharing-off") void reconcile(false);
}
tracker.onStopped(stoppedBecause);

async function reconcileOnce(userInitiated: boolean): Promise<void> {
  const s = controllerStore.get();
  if (!s.ready) return;
  const wantSharing = s.sharing === true;
  if (!wantSharing && !localRequested) {
    await tracker.setMode("off");
    controllerStore.set({ mode: "off" });
    return;
  }

  // The disclosure comes before any system prompt.
  if (!s.consent) {
    if (!s.disclosureOpen) controllerStore.set({ disclosureOpen: true });
    return;
  }

  if (!userInitiated && controllerStore.get().problem === "permission-denied") return;

  if (!userInitiated && (await locationPermission()) !== "granted") {
    // never surprise the user with a system prompt at start-up or from a poll
    controllerStore.set({ problem: "needs-permission" });
    return;
  }

  let target: "local" | "sharing" = wantSharing ? "sharing" : "local";
  if (target === "sharing" && !(await ensureDeviceToken())) {
    controllerStore.set({ problem: "no-token" });
    if (!localRequested) {
      await tracker.setMode("off");
      controllerStore.set({ mode: "off" });
      return;
    }
    target = "local";
  }

  const before = tracker.mode();
  await tracker.setMode(target);
  const after = tracker.mode();
  controllerStore.set({ mode: after, ...(after === target ? { problem: null } : {}) });

  // The first time sharing runs, explain "Allow all the time" and notifications.
  if (after === "sharing" && before !== "sharing" && userInitiated) void maybeOfferBackgroundStep();
}

/** Run a reconcile after the previous one finished, so mode changes never interleave. */
export function reconcile(userInitiated = false): Promise<void> {
  chain = chain.then(() => reconcileOnce(userInitiated)).catch((cause) => log(`reconcile failed: ${String(cause)}`));
  return chain;
}

async function maybeOfferBackgroundStep() {
  if (await nativePrefs.get(PREF_KEYS.backgroundPrompted)) return;
  controllerStore.set({ backgroundOpen: true });
}

/** Read the sharing setting from the server. A failure leaves the last known value. */
export async function refreshSharing(): Promise<void> {
  try {
    const { enabled } = await apiFetch("/api/presence/sharing", { schema: SharingState });
    controllerStore.set({ sharing: enabled });
  } catch (cause) {
    log(`could not read sharing: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  await reconcile(false);
}

/** PUT the setting and start or stop tracking to match. */
export async function setSharing(enabled: boolean, userInitiated = true): Promise<void> {
  const { enabled: now } = await apiFetch("/api/presence/sharing", { method: "PUT", body: { enabled }, schema: SharingState });
  controllerStore.set({ sharing: now });
  await reconcile(userInitiated);
}

export async function loadConsent(): Promise<void> {
  const consent = (await nativePrefs.get(PREF_KEYS.locationConsent)) === "1";
  controllerStore.set({ consent, ready: true });
}

/** The user pressed Continue on the disclosure. */
export async function acceptDisclosure(): Promise<void> {
  await nativePrefs.set(PREF_KEYS.locationConsent, "1");
  controllerStore.set({ consent: true, disclosureOpen: false });
  await reconcile(true);
}

/** The user pressed "Not now". Sharing is switched off again if it was on, so the setting matches what the phone does. */
export async function declineDisclosure(): Promise<void> {
  localRequested = false;
  controllerStore.set({ disclosureOpen: false });
  if (controllerStore.get().sharing) await setSharing(false, false).catch(() => {});
  else await reconcile(false);
}

export async function openBackgroundSettings(): Promise<void> {
  await nativePrefs.set(PREF_KEYS.backgroundPrompted, "1");
  controllerStore.set({ backgroundOpen: false });
  await openAppSettings().catch((cause) => log(`could not open settings: ${String(cause)}`));
}

export async function skipBackgroundStep(): Promise<void> {
  await nativePrefs.set(PREF_KEYS.backgroundPrompted, "1");
  controllerStore.set({ backgroundOpen: false });
}

/** "Allow location" / "Settings" button on the status pill. */
export async function fixProblem(): Promise<void> {
  const { problem } = controllerStore.get();
  if (problem === "permission-denied") {
    await openAppSettings().catch(() => {});
    controllerStore.set({ problem: null });
    return;
  }
  controllerStore.set({ problem: null });
  await reconcile(true);
}

/** The map asked for the user's location (`startLocation`). Returns the matching release. */
export function requestLocal(): () => void {
  localRequested = true;
  void reconcile(true);
  return () => {
    localRequested = false;
    void reconcile(false);
  };
}

export function onTrackerFix(listener: Parameters<typeof tracker.onFix>[0]): () => void {
  return tracker.onFix(listener);
}

/** True when sharing is on and permission is already granted: start tracking without asking for anything. */
export async function startIfAlreadyAllowed(): Promise<boolean> {
  const s = controllerStore.get();
  if (!s.ready || !s.consent || s.sharing !== true) return false;
  return (await locationPermission()) === "granted";
}
