"use client";

/**
 * Small key-value seam over Capacitor Preferences (Android SharedPreferences). Everything in
 * the mobile UI that needs to survive an Activity restart goes through a `KeyValueStore`, so
 * tests can pass an in-memory one. Capacitor is imported inside the functions, never at the top
 * level, so a plain browser and the server never load it.
 */

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const PREF_KEYS = {
  /** PKCE-style verifier for the sign-in handoff, stored before the Custom Tab opens. */
  handoffVerifier: "zoomap.handoff.verifier",
  /** The last handoff code the app finished, so a stale launch URL is not replayed. */
  handoffLastCode: "zoomap.handoff.lastCode",
  /** The device token for background pings. */
  deviceToken: "zoomap.deviceToken",
  /** "1" once the user has accepted the location disclosure. */
  locationConsent: "zoomap.location.consent",
  /** "1" once the user has been taken to settings for "Allow all the time". */
  backgroundPrompted: "zoomap.location.backgroundPrompted",
} as const;

export const nativePrefs: KeyValueStore = {
  async get(key) {
    const { Preferences } = await import("@capacitor/preferences");
    return (await Preferences.get({ key })).value;
  },
  async set(key, value) {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
  },
  async remove(key) {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key });
  },
};

/** An in-memory store, for tests. */
export function memoryPrefs(initial: Record<string, string> = {}): KeyValueStore & { dump(): Record<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    async get(key) {
      return data.get(key) ?? null;
    },
    async set(key, value) {
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
    dump: () => Object.fromEntries(data),
  };
}
