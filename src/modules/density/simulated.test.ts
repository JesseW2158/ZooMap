import { describe, expect, it } from "vitest";
import type { PlaceCategory } from "@/shared/contracts";
import { localClock, simulatedCount, simulatedCounts } from "./sources/simulated";

const place = (id: string, category: PlaceCategory) => ({ id, category });
const CATEGORIES: PlaceCategory[] = ["academic", "library", "dining", "residence", "athletic", "student_life", "other"];

// 2026-11-17 is a Tuesday. November is EST (UTC-5), so 15:05 UTC = 10:05 in Amherst.
const tuesday = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 17, h + 5, m));

describe("simulated density", () => {
  it("is deterministic for a fixed time", () => {
    const places = CATEGORIES.map((c) => place(`p-${c}`, c));
    const at = tuesday(10, 5);
    expect(simulatedCounts(places, at)).toEqual(simulatedCounts(places, new Date(at)));
  });

  it("holds steady inside a five-minute bucket and changes across buckets", () => {
    const p = place("w1", "academic");
    expect(simulatedCount(p, tuesday(10, 5))).toBe(simulatedCount(p, tuesday(10, 8)));
    const counts = new Set([5, 10, 15, 20, 25, 30, 35].map((m) => simulatedCount(p, tuesday(10, m))));
    expect(counts.size).toBeGreaterThan(1);
  });

  it("differs across categories at the same time", () => {
    const at = tuesday(12, 30);
    const counts = CATEGORIES.map((c) => simulatedCount(place("same-id", c), at));
    expect(new Set(counts).size).toBeGreaterThan(3);
  });

  it("differs across hours", () => {
    const p = place("w1", "library");
    expect(simulatedCount(p, tuesday(20))).toBeGreaterThan(simulatedCount(p, tuesday(4)));
  });

  it("shapes each category: classrooms by day, dining at meals, libraries and residences at night", () => {
    const at = (c: PlaceCategory, h: number, m = 0) => simulatedCount(place("shape", c), tuesday(h, m));
    expect(at("academic", 10, 5)).toBeGreaterThan(at("academic", 22));
    expect(at("academic", 10, 5)).toBeGreaterThan(at("academic", 10, 45));
    expect(at("dining", 12, 30)).toBeGreaterThan(at("dining", 15, 30));
    expect(at("library", 20)).toBeGreaterThan(at("library", 7));
    expect(at("residence", 2)).toBeGreaterThan(at("residence", 14));
  });

  it("reads the hour in America/New_York, not UTC", () => {
    // 03:00 UTC on Wednesday is 22:00 on Tuesday evening in Amherst
    expect(localClock(new Date(Date.UTC(2026, 10, 18, 3, 0)))).toMatchObject({ hour: 22, weekday: true });
    // 03:00 UTC on Saturday is still Friday evening locally; 03:00 UTC on Monday is Sunday
    expect(localClock(new Date(Date.UTC(2026, 10, 21, 3, 0))).weekday).toBe(true);
    expect(localClock(new Date(Date.UTC(2026, 10, 23, 3, 0))).weekday).toBe(false);
  });

  it("keeps classrooms quiet on weekends", () => {
    const saturday = new Date(Date.UTC(2026, 10, 21, 15, 5));
    expect(simulatedCount(place("w1", "academic"), saturday)).toBeLessThan(simulatedCount(place("w1", "academic"), tuesday(10, 5)));
  });
});
