import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKGROUND_MESSAGE,
  createTracker,
  interpretPingResponse,
  type StopReason,
  type TrackerDeps,
  type WatcherError,
  type WatcherLocation,
  type WatcherOptions,
} from "./tracking";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

type Callback = (location?: WatcherLocation | null, error?: WatcherError | null) => void;

function setup(opts: { status?: number; data?: unknown; token?: string | null; holdAdd?: boolean } = {}) {
  const added: { id: string; options: WatcherOptions; callback: Callback }[] = [];
  const removed: string[] = [];
  let releaseAdd: (() => void) | null = null;
  let n = 0;
  const post = vi.fn(async () => ({ status: opts.status ?? 201, data: opts.data ?? {} }));
  const clearToken = vi.fn(async () => {});
  const deps: TrackerDeps = {
    watcher: {
      addWatcher: async (options, callback) => {
        const id = `w${++n}`;
        added.push({ id, options, callback });
        if (opts.holdAdd) await new Promise<void>((resolve) => (releaseAdd = resolve));
        return id;
      },
      removeWatcher: async ({ id }) => void removed.push(id),
    },
    getToken: async () => (opts.token === undefined ? "TOKEN" : opts.token),
    clearToken,
    post,
    sleep: async () => {},
  };
  const tracker = createTracker(deps);
  const stopped: StopReason[] = [];
  tracker.onStopped((r) => stopped.push(r));
  const fix = (cb: Callback) => cb({ latitude: 42.39, longitude: -72.527, accuracy: 9, time: Date.now() });
  return { tracker, added, removed, post, clearToken, stopped, fix, release: () => releaseAdd?.() };
}

describe("interpretPingResponse", () => {
  it("maps the server's answers", () => {
    expect(interpretPingResponse(200, {})).toBe("ok");
    expect(interpretPingResponse(201, null)).toBe("ok");
    expect(interpretPingResponse(401, {})).toBe("unauthorized");
    expect(interpretPingResponse(403, { error: { code: "SHARING_OFF" } })).toBe("sharing-off");
    expect(interpretPingResponse(403, "")).toBe("sharing-off");
    expect(interpretPingResponse(403, { error: { code: "FORBIDDEN" } })).toBe("unauthorized");
    expect(interpretPingResponse(500, {})).toBe("error");
    expect(interpretPingResponse(429, {})).toBe("error");
  });
});

describe("sharing mode", () => {
  it("asks for a background watcher with no distance filter and fresh fixes", async () => {
    const { tracker, added } = setup();
    await tracker.setMode("sharing");
    expect(added).toHaveLength(1);
    expect(added[0]!.options).toMatchObject({
      backgroundMessage: BACKGROUND_MESSAGE,
      distanceFilter: 0,
      stale: false,
    });
    expect(added[0]!.options.backgroundTitle).toBeTruthy();
  });

  it("pings with the bearer token, at most once a minute", async () => {
    const { tracker, added, post, fix } = setup();
    await tracker.setMode("sharing");
    const cb = added[0]!.callback;
    for (let s = 0; s < 150; s++) {
      fix(cb);
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(post).toHaveBeenCalledTimes(3); // t=0, 60, 120
    expect(post).toHaveBeenCalledWith("TOKEN", { lat: 42.39, lng: -72.527, accuracyM: 9 });
  });

  it("keeps pinging a phone that stops sending fixes", async () => {
    const { tracker, added, post, fix } = setup();
    await tracker.setMode("sharing");
    fix(added[0]!.callback);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(post.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("removes the watcher and reports it when sharing is off (403)", async () => {
    const { tracker, added, removed, stopped, fix } = setup({ status: 403, data: { error: { code: "SHARING_OFF" } } });
    await tracker.setMode("sharing");
    fix(added[0]!.callback);
    await vi.advanceTimersByTimeAsync(0);
    expect(removed).toEqual(["w1"]);
    expect(stopped).toEqual(["sharing-off"]);
    expect(tracker.mode()).toBe("off");
  });

  it("drops the token and the watcher on 401", async () => {
    const { tracker, added, removed, stopped, clearToken, fix } = setup({ status: 401 });
    await tracker.setMode("sharing");
    fix(added[0]!.callback);
    await vi.advanceTimersByTimeAsync(0);
    expect(clearToken).toHaveBeenCalledOnce();
    expect(removed).toEqual(["w1"]);
    expect(stopped).toEqual(["unauthorized"]);
  });

  it("treats a missing token as unauthorized without sending anything", async () => {
    const { tracker, added, post, stopped, fix } = setup({ token: null });
    await tracker.setMode("sharing");
    fix(added[0]!.callback);
    await vi.advanceTimersByTimeAsync(0);
    expect(post).not.toHaveBeenCalled();
    expect(stopped).toEqual(["unauthorized"]);
  });

  it("removes the watcher, and so the notification, when switched off", async () => {
    const { tracker, added, removed, post, fix } = setup();
    await tracker.setMode("sharing");
    await tracker.setMode("off");
    expect(removed).toEqual(["w1"]);
    fix(added[0]!.callback); // a late fix from the plugin
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(post).not.toHaveBeenCalled();
  });
});

describe("local mode", () => {
  it("watches without a notification and sends nothing", async () => {
    const { tracker, added, post, fix } = setup();
    await tracker.setMode("local");
    expect(added[0]!.options.backgroundMessage).toBeUndefined();
    const seen: number[] = [];
    tracker.onFix((f) => seen.push(f.lat));
    fix(added[0]!.callback);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(seen).toEqual([42.39]);
    expect(post).not.toHaveBeenCalled();
  });

  it("swaps to a background watcher when sharing starts", async () => {
    const { tracker, added, removed } = setup();
    await tracker.setMode("local");
    await tracker.setMode("sharing");
    expect(removed).toEqual(["w1"]);
    expect(added).toHaveLength(2);
    expect(added[1]!.options.backgroundMessage).toBe(BACKGROUND_MESSAGE);
  });
});

describe("starting and stopping", () => {
  it("removes a watcher that was still being added when tracking was switched off", async () => {
    const { tracker, removed, release } = setup({ holdAdd: true });
    const starting = tracker.setMode("sharing");
    await vi.advanceTimersByTimeAsync(0);
    await tracker.setMode("off");
    release();
    await starting;
    expect(removed).toEqual(["w1"]);
  });

  it("removes the watcher when permission is denied", async () => {
    const { tracker, added, removed, stopped } = setup();
    await tracker.setMode("sharing");
    added[0]!.callback(null, { code: "NOT_AUTHORIZED", message: "User denied location permission" });
    await vi.advanceTimersByTimeAsync(0);
    expect(removed).toEqual(["w1"]);
    expect(stopped).toEqual(["permission-denied"]);
  });

  it("asks again when the plugin service was not up yet", async () => {
    const { tracker, added, removed } = setup();
    await tracker.setMode("local");
    added[0]!.callback(null, { message: "Service not running." });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(added).toHaveLength(2);
    expect(removed).toEqual(["w1"]);
    expect(tracker.mode()).toBe("local");
  });
});
