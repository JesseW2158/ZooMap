import { describe, expect, it, vi } from "vitest";
import { createEventBus } from "./bus";

const ENDED = {
  participationId: "p1",
  activityId: "a1",
  userId: "u1",
  role: "guest" as const,
  joinedAt: new Date("2026-01-01T10:00:00Z"),
  endedAt: new Date("2026-01-01T10:30:00Z"),
  verifiedSeconds: 1800,
};

function silentBus() {
  const errors: unknown[][] = [];
  const bus = createEventBus({ error: (...args) => void errors.push(args) });
  return { bus, errors };
}

describe("event bus", () => {
  it("delivers to every subscriber in registration order", async () => {
    const { bus } = silentBus();
    const order: string[] = [];
    bus.on("participation.ended", "first", async () => {
      await Promise.resolve();
      order.push("first");
    });
    bus.on("participation.ended", "second", () => void order.push("second"));
    await bus.emit("participation.ended", ENDED);
    expect(order).toEqual(["first", "second"]);
  });

  it("a throwing subscriber is logged and never reaches the emitter or the others", async () => {
    const { bus, errors } = silentBus();
    const after = vi.fn();
    bus.on("participation.ended", "boom", () => {
      throw new Error("kaboom");
    });
    bus.on("participation.ended", "rejects", () => Promise.reject(new Error("later")));
    bus.on("participation.ended", "after", after);

    await expect(bus.emit("participation.ended", ENDED)).resolves.toBeUndefined();
    expect(after).toHaveBeenCalledOnce();
    expect(errors).toHaveLength(2);
    expect(String(errors[0][0])).toContain("boom");
  });

  it("registering the same id again replaces the handler instead of doubling it", async () => {
    const { bus } = silentBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("participation.ended", "rewards:time", a);
    bus.on("participation.ended", "rewards:time", b);
    await bus.emit("participation.ended", ENDED);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it("rejects a payload that breaks the contract: that is the emitter's bug", async () => {
    const { bus } = silentBus();
    const handler = vi.fn();
    bus.on("participation.ended", "h", handler);
    await expect(bus.emit("participation.ended", { ...ENDED, verifiedSeconds: -5 })).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it("off removes a subscriber and clear removes all", async () => {
    const { bus } = silentBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("participation.ended", "a", a);
    bus.on("participation.ended", "b", b);
    bus.off("participation.ended", "a");
    await bus.emit("participation.ended", ENDED);
    bus.clear();
    await bus.emit("participation.ended", ENDED);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });
});
