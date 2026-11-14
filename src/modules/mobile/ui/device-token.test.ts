import { describe, expect, it, vi } from "vitest";
import { ensureDeviceToken, resetDeviceToken, type DeviceTokenDeps } from "./device-token";
import { PREF_KEYS, memoryPrefs } from "./prefs";
import { parseStoredToken, readTokenForPing, serializeStoredToken } from "./stored-token";

function setup(opts: { session: string | null; stored?: string; issued?: string }) {
  const store = memoryPrefs(opts.stored === undefined ? {} : { [PREF_KEYS.deviceToken]: opts.stored });
  const deps = {
    sessionUserId: vi.fn(async () => opts.session),
    issue: vi.fn(async () => opts.issued ?? "NEW"),
    stopTracking: vi.fn(async () => {}),
  } satisfies DeviceTokenDeps;
  return { store, deps };
}

describe("ensureDeviceToken", () => {
  it("issues a token bound to the signed-in user when there is none", async () => {
    const { store, deps } = setup({ session: "u1" });
    expect(await ensureDeviceToken(store, deps)).toBe(true);
    expect(parseStoredToken(await store.get(PREF_KEYS.deviceToken))).toEqual({ token: "NEW", userId: "u1" });
    expect(deps.stopTracking).not.toHaveBeenCalled();
  });

  it("keeps the token when it belongs to the signed-in user", async () => {
    const { store, deps } = setup({ session: "u1", stored: serializeStoredToken("OLD", "u1") });
    expect(await ensureDeviceToken(store, deps)).toBe(true);
    expect(deps.issue).not.toHaveBeenCalled();
    expect(deps.stopTracking).not.toHaveBeenCalled();
    expect(await readTokenForPing(store)).toBe("OLD");
  });

  it("stops tracking, drops the token and issues a new one when another user is signed in", async () => {
    const { store, deps } = setup({ session: "u2", stored: serializeStoredToken("A-TOKEN", "u1"), issued: "B-TOKEN" });
    expect(await ensureDeviceToken(store, deps)).toBe(true);
    expect(deps.stopTracking).toHaveBeenCalledOnce();
    expect(deps.issue).toHaveBeenCalledOnce();
    expect(parseStoredToken(await store.get(PREF_KEYS.deviceToken))).toEqual({ token: "B-TOKEN", userId: "u2" });
  });

  it("does nothing without a session: no issue, nothing removed", async () => {
    const { store, deps } = setup({ session: null, stored: serializeStoredToken("OLD", "u1") });
    expect(await ensureDeviceToken(store, deps)).toBe(false);
    expect(deps.issue).not.toHaveBeenCalled();
    expect(deps.stopTracking).not.toHaveBeenCalled();
    expect(await store.get(PREF_KEYS.deviceToken)).toBe(serializeStoredToken("OLD", "u1"));
  });

  it("treats a legacy bare-string token as a mismatch and replaces it", async () => {
    const { store, deps } = setup({ session: "u1", stored: "LEGACY-TOKEN" });
    expect(await readTokenForPing(store)).toBeNull(); // not used for pings
    expect(await ensureDeviceToken(store, deps)).toBe(true);
    expect(deps.stopTracking).toHaveBeenCalledOnce();
    expect(parseStoredToken(await store.get(PREF_KEYS.deviceToken))).toEqual({ token: "NEW", userId: "u1" });
  });

  it("reports false when the server refuses to issue (the old token is already gone)", async () => {
    const { store, deps } = setup({ session: "u2", stored: serializeStoredToken("A", "u1") });
    deps.issue.mockRejectedValue(new Error("401"));
    expect(await ensureDeviceToken(store, deps)).toBe(false);
    expect(await store.get(PREF_KEYS.deviceToken)).toBeNull();
  });

  it("gets a new token after a 401 removed the old one", async () => {
    const { store, deps } = setup({ session: "u1", stored: serializeStoredToken("OLD", "u1"), issued: "FRESH" });
    await store.remove(PREF_KEYS.deviceToken); // what the tracker does on 401
    await ensureDeviceToken(store, deps);
    expect(await readTokenForPing(store)).toBe("FRESH");
  });
});

describe("resetDeviceToken", () => {
  it("stops tracking and removes the token", async () => {
    const store = memoryPrefs({ [PREF_KEYS.deviceToken]: serializeStoredToken("T", "u1") });
    const stop = vi.fn(async () => {});
    await resetDeviceToken(store, stop);
    expect(stop).toHaveBeenCalledOnce();
    expect(await store.get(PREF_KEYS.deviceToken)).toBeNull();
  });
});

describe("parseStoredToken", () => {
  it("reads the bound form, and flags bare strings and junk", () => {
    expect(parseStoredToken(serializeStoredToken("T", "u"))).toEqual({ token: "T", userId: "u" });
    expect(parseStoredToken("bare")).toEqual({ token: "bare", userId: null });
    expect(parseStoredToken(null)).toBeNull();
    expect(parseStoredToken('{"token":"T"}')).toBeNull();
  });
});
