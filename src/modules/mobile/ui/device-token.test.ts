import { describe, expect, it, vi } from "vitest";
import { ensureDeviceToken } from "./device-token";
import { PREF_KEYS, memoryPrefs } from "./prefs";

describe("ensureDeviceToken", () => {
  it("fetches and stores a token when there is none", async () => {
    const store = memoryPrefs();
    const issue = vi.fn(async () => "NEW");
    expect(await ensureDeviceToken(store, issue)).toBe(true);
    expect(await store.get(PREF_KEYS.deviceToken)).toBe("NEW");
  });

  it("keeps the token it has", async () => {
    const store = memoryPrefs({ [PREF_KEYS.deviceToken]: "OLD" });
    const issue = vi.fn(async () => "NEW");
    expect(await ensureDeviceToken(store, issue)).toBe(true);
    expect(issue).not.toHaveBeenCalled();
    expect(await store.get(PREF_KEYS.deviceToken)).toBe("OLD");
  });

  it("reports false and stores nothing when the server refuses (signed out)", async () => {
    const store = memoryPrefs();
    expect(await ensureDeviceToken(store, async () => Promise.reject(new Error("401")))).toBe(false);
    expect(await store.get(PREF_KEYS.deviceToken)).toBeNull();
  });

  it("gets a new one after the old one was removed", async () => {
    const store = memoryPrefs({ [PREF_KEYS.deviceToken]: "OLD" });
    await store.remove(PREF_KEYS.deviceToken);
    await ensureDeviceToken(store, async () => "FRESH");
    expect(await store.get(PREF_KEYS.deviceToken)).toBe("FRESH");
  });
});
