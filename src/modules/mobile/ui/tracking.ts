"use client";

import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { createPinger, type Fix, type PingResult, type Pinger } from "./pinger";
import { PREF_KEYS, nativePrefs } from "./prefs";
import { readTokenForPing } from "./stored-token";

/**
 * Native location tracking for the Android shell, on @capacitor-community/background-geolocation.
 *
 * Modes:
 *   off      no watcher.
 *   local    a foreground-only watcher (no notification) that feeds the map's "you are here" dot.
 *   sharing  a watcher with a background notification (a foreground service) plus the pinger that
 *            reports the fix to /api/presence/ping every 60 to 90 s with the device token.
 * Leaving `sharing` always removes the watcher, which ends the foreground service and its
 * notification (the plugin stops foregrounding when its last background watcher is removed).
 *
 * The plugin and the network are passed in (`TrackerDeps`) so the control flow is unit-tested;
 * `nativeTrackerDeps()` is the real wiring. Fixes are logged with the `[zoomap-native]` prefix
 * so `chrome://inspect` shows whether fixes keep arriving while the phone lies still.
 */

export type TrackingMode = "off" | "local" | "sharing";
export type StopReason = "unauthorized" | "sharing-off" | "permission-denied" | "error";

/** The fields of the plugin's `Location` that the tracker uses. */
export interface WatcherLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  time?: number | null;
}
export interface WatcherError {
  code?: string;
  message?: string;
}
export interface WatcherOptions {
  backgroundMessage?: string;
  backgroundTitle?: string;
  requestPermissions?: boolean;
  stale?: boolean;
  distanceFilter?: number;
}
export interface WatcherApi {
  addWatcher(
    options: WatcherOptions,
    callback: (location?: WatcherLocation | null, error?: WatcherError | null) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
}

export interface TrackerDeps {
  watcher: WatcherApi;
  /** The device token, or null when there is none. */
  getToken(): Promise<string | null>;
  clearToken(): Promise<void>;
  /** POST a ping. Resolves with the HTTP status and parsed body; rejects on a network error. */
  post(token: string, body: { lat: number; lng: number; accuracyM?: number }): Promise<{ status: number; data: unknown }>;
  now?: () => number;
  log?: (message: string) => void;
  /** Wait before retrying a watcher that could not start yet. Tests pass an instant one. */
  sleep?: (ms: number) => Promise<void>;
  createPinger?: typeof createPinger;
  /**
   * Where watcher ids are remembered across page loads. A full page load (sign-out, the reload after
   * connecting a calendar) throws the JavaScript side away but not the plugin's watcher, which would
   * keep the foreground service and its notification alive with nobody listening. The next page
   * removes whatever the last one left.
   */
  watcherIds?: { read(): Promise<string[]>; write(ids: string[]): Promise<void> };
}

export interface Tracker {
  mode(): TrackingMode;
  /** Switch mode. Resolves once the watcher for the new mode has been asked for (or removed). */
  setMode(mode: TrackingMode): Promise<void>;
  onFix(listener: (fix: Fix) => void): () => void;
  /** Tracking stopped on its own: the token was refused, sharing is off, or permission was denied. */
  onStopped(listener: (reason: StopReason) => void): () => void;
  /** Remove watchers left behind by an earlier page. Runs by itself before the first `setMode`. */
  clearOrphans(): Promise<void>;
}

export const BACKGROUND_TITLE = "ZooMap is sharing your location";
export const BACKGROUND_MESSAGE =
  "ZooMap is sharing an approximate location for the crowd heatmap and activity time. Turn it off in the app.";

const START_RETRIES = 5;
const START_RETRY_MS = 1500;
const FIX_LOG_EVERY_MS = 5_000;

/** Map an HTTP answer from POST /api/presence/ping to what the tracker does next. */
export function interpretPingResponse(status: number, data: unknown): PingResult {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401) return "unauthorized";
  if (status === 403) {
    const code = (data as { error?: { code?: unknown } } | null)?.error?.code;
    // FORBIDDEN is "signed in but not allowed": this token is useless, same as a 401
    return code === "FORBIDDEN" ? "unauthorized" : "sharing-off";
  }
  return "error";
}

export function createTracker(deps: TrackerDeps): Tracker {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const makePinger = deps.createPinger ?? createPinger;

  let mode: TrackingMode = "off";
  /** Bumped by every mode change and every self-stop; a callback or add from an older one is stale. */
  let generation = 0;
  let watcherId: string | null = null;
  let pinger: Pinger | null = null;
  let lastFixLogAt = 0;
  const fixListeners = new Set<(fix: Fix) => void>();
  const stopListeners = new Set<(reason: StopReason) => void>();

  const send = async (fix: Fix): Promise<PingResult> => {
    const token = await deps.getToken();
    if (!token) return "unauthorized";
    try {
      const res = await deps.post(token, {
        lat: fix.lat,
        lng: fix.lng,
        ...(fix.accuracyM !== undefined ? { accuracyM: fix.accuracyM } : {}),
      });
      return interpretPingResponse(res.status, res.data);
    } catch (cause) {
      log(`ping failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      return "error";
    }
  };

  const removeWatcherById = async (id: string | null) => {
    if (!id) return;
    try {
      await deps.watcher.removeWatcher({ id });
      log(`watcher ${id} removed`);
    } catch (cause) {
      log(`could not remove watcher ${id}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };

  const writeIds = async () => {
    try {
      await deps.watcherIds?.write(watcherId ? [watcherId] : []);
    } catch {
      // best effort
    }
  };

  const teardown = async () => {
    pinger?.stop();
    pinger = null;
    const id = watcherId;
    watcherId = null;
    await removeWatcherById(id);
    await writeIds();
  };

  let orphans: Promise<void> | null = null;
  const clearOrphans = () => {
    orphans ??= (async () => {
      try {
        const ids = (await deps.watcherIds?.read()) ?? [];
        for (const id of ids) await removeWatcherById(id);
        if (ids.length) await deps.watcherIds?.write([]);
      } catch {
        // best effort
      }
    })();
    return orphans;
  };

  /** Stop on our own account. Bumps the generation so a watcher still being added is removed when it lands. */
  const stopBy = async (reason: StopReason, gen: number) => {
    if (gen !== generation) return;
    generation += 1;
    mode = "off";
    await teardown();
    for (const l of stopListeners) l(reason);
  };

  const toFix = (loc: WatcherLocation): Fix => ({
    lat: loc.latitude,
    lng: loc.longitude,
    ...(typeof loc.accuracy === "number" ? { accuracyM: loc.accuracy } : {}),
    time: typeof loc.time === "number" && loc.time > 0 ? loc.time : now(),
  });

  const startWatcher = async (target: Exclude<TrackingMode, "off">, gen: number, attempt = 0): Promise<void> => {
    const options: WatcherOptions =
      target === "sharing"
        ? {
            backgroundTitle: BACKGROUND_TITLE,
            backgroundMessage: BACKGROUND_MESSAGE,
            requestPermissions: true,
            stale: false,
            distanceFilter: 0,
          }
        : { requestPermissions: true, stale: false, distanceFilter: 0 };

    let id: string | undefined;
    try {
      id = await deps.watcher.addWatcher(options, (location, error) => {
        if (gen !== generation) return;
        if (error) {
          log(`watcher error: ${error.code ?? ""} ${error.message ?? ""}`);
          if (error.code === "NOT_AUTHORIZED") {
            void stopBy("permission-denied", gen);
          } else if (/service not running/i.test(error.message ?? "") && attempt < START_RETRIES) {
            // The plugin's service binds when the page loads; give it a moment and ask again.
            void (async () => {
              await sleep(START_RETRY_MS);
              if (gen !== generation) return;
              const failed = watcherId;
              watcherId = null;
              await removeWatcherById(failed);
              if (gen === generation) await startWatcher(target, gen, attempt + 1);
            })();
          } else {
            void stopBy("error", gen);
          }
          return;
        }
        if (!location) return;
        const fix = toFix(location);
        const t = now();
        if (t - lastFixLogAt >= FIX_LOG_EVERY_MS) {
          lastFixLogAt = t;
          log(`fix ${new Date(fix.time).toISOString()} acc=${fix.accuracyM ?? "?"} m age=${Math.round((t - fix.time) / 1000)} s`);
        }
        for (const l of fixListeners) l(fix);
        pinger?.onFix(fix);
      });
    } catch (cause) {
      log(`addWatcher failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      void stopBy("error", gen);
      return;
    }

    if (gen !== generation) {
      // switched or stopped while the watcher was being added
      await removeWatcherById(id ?? null);
      return;
    }
    watcherId = id ?? null;
    await writeIds();
  };

  return {
    mode: () => mode,
    clearOrphans,
    onFix(listener) {
      fixListeners.add(listener);
      return () => fixListeners.delete(listener);
    },
    onStopped(listener) {
      stopListeners.add(listener);
      return () => stopListeners.delete(listener);
    },
    async setMode(next) {
      if (next === mode) return;
      generation += 1;
      const gen = generation;
      log(`mode ${mode} -> ${next}`);
      mode = next;
      await clearOrphans();
      await teardown();
      if (gen !== generation || next === "off") return;
      if (next === "sharing") {
        pinger = makePinger({
          send,
          log,
          onFatal: (reason) => {
            if (reason === "unauthorized") void deps.clearToken();
            void stopBy(reason, gen);
          },
        });
        pinger.start();
      }
      await startWatcher(next, gen);
    },
  };
}

type RawPlugin = BackgroundGeolocationPlugin & { checkPermissions(): Promise<{ location?: string }> };

let pluginPromise: Promise<RawPlugin> | null = null;

/** The plugin handle. `registerPlugin` may run once per name, so everything shares this one. */
function loadPlugin(): Promise<RawPlugin> {
  pluginPromise ??= import("@capacitor/core").then(({ registerPlugin }) => registerPlugin<RawPlugin>("BackgroundGeolocation"));
  return pluginPromise;
}

/** The real plugin and the real network. Capacitor is imported here, on first use, never at load. */
export function nativeTrackerDeps(): TrackerDeps {
  return {
    watcher: {
      addWatcher: async (options, callback) => (await loadPlugin()).addWatcher(options, callback as never),
      removeWatcher: async (options) => (await loadPlugin()).removeWatcher(options),
    },
    getToken: () => readTokenForPing(nativePrefs),
    clearToken: () => nativePrefs.remove(PREF_KEYS.deviceToken),
    watcherIds: {
      async read() {
        try {
          const parsed: unknown = JSON.parse((await nativePrefs.get(PREF_KEYS.watcherIds)) ?? "[]");
          return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
        } catch {
          return [];
        }
      },
      write: (ids) => nativePrefs.set(PREF_KEYS.watcherIds, JSON.stringify(ids)),
    },
    async post(token, body) {
      // Native HTTP, not fetch: Android throttles WebView requests about five minutes after the
      // app goes to the background. Used per request; the global fetch patch stays off so
      // Auth.js cookie flows are untouched.
      const { CapacitorHttp } = await import("@capacitor/core");
      const res = await CapacitorHttp.post({
        url: `${window.location.origin}/api/presence/ping`,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: body,
        connectTimeout: 15_000,
        readTimeout: 15_000,
      });
      return { status: res.status, data: res.data };
    },
    log: (message) => console.log(`[zoomap-native] ${message}`),
  };
}

let shared: Tracker | null = null;

/** The one tracker for this page. */
export function getTracker(): Tracker {
  shared ??= createTracker(nativeTrackerDeps());
  return shared;
}

/** The plugin's permission state for foreground location, without prompting. */
export async function locationPermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  try {
    // checkPermissions exists on every Capacitor plugin that declares permissions; this plugin's
    // typings just do not list it.
    const { location } = await (await loadPlugin()).checkPermissions();
    return location === "granted" || location === "denied" || location === "prompt" ? location : "unknown";
  } catch {
    return "unknown";
  }
}

/** Open Android's settings page for this app (where "Allow all the time" and Notifications live). */
export async function openAppSettings(): Promise<void> {
  await (await loadPlugin()).openSettings();
}
