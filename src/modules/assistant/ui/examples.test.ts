import { describe, expect, it } from "vitest";
import { EXAMPLES, dayPart, examplesFor } from "./examples";

// Amherst is UTC-5 in November (EST) and UTC-4 in June (EDT).
const est = (hhmm: string) => new Date(`2026-11-16T${hhmm}:00-05:00`);

describe("search bar examples", () => {
  it.each([
    ["04:59", "late"],
    ["05:00", "morning"],
    ["10:59", "morning"],
    ["11:00", "midday"],
    ["14:00", "afternoon"],
    ["17:00", "evening"],
    ["21:59", "evening"],
    ["22:00", "late"],
    ["00:30", "late"],
  ] as const)("%s on campus is %s", (time, part) => {
    expect(dayPart(est(time))).toBe(part);
  });

  it("uses Amherst time in daylight saving too", () => {
    expect(dayPart(new Date("2026-06-15T12:30:00Z"))).toBe("morning"); // 8:30 EDT
  });

  it("offers breakfast in the morning and late-night study at night", () => {
    expect(examplesFor(est("07:30"))).toContain("early breakfast meetups");
    expect(examplesFor(est("23:30"))).toContain("late-night study spots");
  });

  it("has a few short examples for every part of the day", () => {
    for (const list of Object.values(EXAMPLES)) {
      expect(list.length).toBeGreaterThanOrEqual(3);
      for (const e of list) expect(e.length).toBeLessThanOrEqual(36);
    }
  });
});
