import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog";
import { REWARDS_CONFIG } from "./config";
import { timeAtActivityPoints } from "./rules/time-at-activity";
import { newClaimCode } from "./store";
import { startOfDay, startOfNextDay } from "./time";

const NY = "America/New_York";

describe("timeAtActivityPoints", () => {
  it("pays whole minutes times the rate", () => {
    expect(timeAtActivityPoints({ verifiedSeconds: 42 * 60 + 59, perMinute: 1, alreadyToday: 0 })).toBe(42);
    expect(timeAtActivityPoints({ verifiedSeconds: 59, perMinute: 5, alreadyToday: 0 })).toBe(0);
    expect(timeAtActivityPoints({ verifiedSeconds: 600, perMinute: 3, alreadyToday: 0 })).toBe(30);
  });

  it("caps one participation at 240", () => {
    expect(timeAtActivityPoints({ verifiedSeconds: 10 * 3600, perMinute: 1, alreadyToday: 0 })).toBe(240);
  });

  it("caps the day at 600, counting what was already paid", () => {
    expect(timeAtActivityPoints({ verifiedSeconds: 4 * 3600, perMinute: 1, alreadyToday: 480 })).toBe(120);
    expect(timeAtActivityPoints({ verifiedSeconds: 4 * 3600, perMinute: 1, alreadyToday: 600 })).toBe(0);
    expect(timeAtActivityPoints({ verifiedSeconds: 4 * 3600, perMinute: 1, alreadyToday: 700 })).toBe(0);
  });

  it("never pays for negative input", () => {
    expect(timeAtActivityPoints({ verifiedSeconds: -600, perMinute: 1, alreadyToday: 0 })).toBe(0);
    expect(timeAtActivityPoints({ verifiedSeconds: 600, perMinute: -1, alreadyToday: 0 })).toBe(0);
  });
});

describe("New York calendar days", () => {
  it("finds local midnight in winter (UTC-5) and summer (UTC-4)", () => {
    expect(startOfDay(new Date("2026-01-15T03:30:00Z"), NY).toISOString()).toBe("2026-01-14T05:00:00.000Z");
    expect(startOfDay(new Date("2026-07-15T16:00:00Z"), NY).toISOString()).toBe("2026-07-15T04:00:00.000Z");
  });

  it("handles the DST change days", () => {
    // 2026-03-08 springs forward; 2026-11-01 falls back.
    expect(startOfDay(new Date("2026-03-08T20:00:00Z"), NY).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(startOfNextDay(new Date("2026-03-08T20:00:00Z"), NY).toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(startOfDay(new Date("2026-11-01T20:00:00Z"), NY).toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(startOfNextDay(new Date("2026-11-01T20:00:00Z"), NY).toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("11:30 pm in New York is still that day", () => {
    expect(startOfDay(new Date("2026-11-15T04:30:00Z"), NY).toISOString()).toBe("2026-11-14T05:00:00.000Z");
  });
});

describe("store", () => {
  it("issues readable, unambiguous claim codes", () => {
    const codes = new Set(Array.from({ length: 200 }, newClaimCode));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(code).toMatch(/^ZOO-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  });

  it("has about eight items, with some affordable within one day's cap", () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(6);
    expect(new Set(CATALOG.map((i) => i._id)).size).toBe(CATALOG.length);
    expect(CATALOG.filter((i) => i.cost <= REWARDS_CONFIG.timeAtActivity.perParticipationCap).length).toBeGreaterThanOrEqual(3);
  });
});
