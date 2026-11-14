import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinger, type Fix, type PingResult } from "./pinger";

const fixAt = (time = Date.now()): Fix => ({ lat: 42.39, lng: -72.527, accuracyM: 12, time });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(result: PingResult | (() => Promise<PingResult>) = "ok") {
  const sentAt: number[] = [];
  const t0 = Date.now();
  const send = vi.fn(async () => {
    sentAt.push((Date.now() - t0) / 1000);
    return typeof result === "function" ? result() : result;
  });
  const onFatal = vi.fn();
  const pinger = createPinger({ send, onFatal });
  pinger.start();
  return { pinger, send, sentAt, onFatal };
}

describe("ping throttle", () => {
  it("pings the first fix at once", () => {
    const { pinger, send } = setup();
    pinger.onFix(fixAt());
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends at most one ping a minute from a fix every second", async () => {
    const { pinger, sentAt } = setup();
    for (let s = 0; s < 300; s++) {
      pinger.onFix(fixAt());
      await vi.advanceTimersByTimeAsync(1000);
    }
    pinger.stop();
    expect(sentAt).toEqual([0, 60, 120, 180, 240]);
  });

  it("sends the fix that arrives after the gap, not the stale one", async () => {
    const { pinger, send } = setup();
    pinger.onFix(fixAt());
    await vi.advanceTimersByTimeAsync(30_000);
    pinger.onFix(fixAt()); // inside the gap: remembered, not sent
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    pinger.onFix(fixAt());
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0].time).toBe(Date.now());
  });
});

describe("fallback timer", () => {
  it("keeps pinging a phone that produces no more fixes, never more than 150 s apart", async () => {
    const { pinger, sentAt } = setup();
    pinger.onFix(fixAt()); // one fix at t=0, then silence
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    pinger.stop();
    expect(sentAt[0]).toBe(0);
    expect(sentAt.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < sentAt.length; i++) {
      expect(sentAt[i]! - sentAt[i - 1]!).toBeLessThanOrEqual(120);
    }
  });

  it("resends the same last fix", async () => {
    const { pinger, send } = setup();
    const fix = fixAt();
    pinger.onFix(fix);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0]).toBe(fix);
  });

  it("does nothing before the first fix", async () => {
    const { pinger, send } = setup();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    pinger.stop();
    expect(send).not.toHaveBeenCalled();
  });

  it("stops resending a fix that is older than ten minutes", async () => {
    const { pinger, sentAt } = setup();
    pinger.onFix(fixAt());
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    pinger.stop();
    expect(sentAt.length).toBeGreaterThan(1);
    expect(Math.max(...sentAt)).toBeLessThanOrEqual(10 * 60);
  });
});

describe("failures", () => {
  it("does not overlap a slow request", async () => {
    let release!: (r: PingResult) => void;
    const { pinger, send } = setup(() => new Promise<PingResult>((resolve) => (release = resolve)));
    pinger.onFix(fixAt());
    await vi.advanceTimersByTimeAsync(120_000);
    pinger.onFix(fixAt());
    expect(send).toHaveBeenCalledTimes(1);
    release("ok");
    await vi.advanceTimersByTimeAsync(0);
    pinger.onFix(fixAt());
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("keeps going after a network error", async () => {
    const { pinger, send, onFatal } = setup("error");
    pinger.onFix(fixAt());
    await vi.advanceTimersByTimeAsync(60_000);
    pinger.onFix(fixAt());
    expect(send).toHaveBeenCalledTimes(2);
    expect(onFatal).not.toHaveBeenCalled();
  });

  it("treats a thrown send as an error, not a crash", async () => {
    const send = vi.fn().mockRejectedValue(new Error("offline"));
    const pinger = createPinger({ send });
    pinger.start();
    pinger.onFix(fixAt());
    await vi.advanceTimersByTimeAsync(60_000);
    pinger.onFix(fixAt());
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["unauthorized", "unauthorized"],
    ["sharing-off", "sharing-off"],
  ] as const)("stops for good on %s", async (result, reason) => {
    const { pinger, send, onFatal } = setup(result);
    pinger.onFix(fixAt());
    await vi.advanceTimersByTimeAsync(0);
    expect(onFatal).toHaveBeenCalledExactlyOnceWith(reason);
    pinger.onFix(fixAt());
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
