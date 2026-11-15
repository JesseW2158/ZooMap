import { describe, expect, it } from "vitest";
import type { PlaceCategory } from "@/shared/contracts";
import { CAPACITY, capacityOf, heatWeight, levelFor } from "./capacity";
import { simulatedCount } from "./sources/simulated";

// 2026-11-17 is a Tuesday. November is EST (UTC-5).
const tuesday = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 17, h + 5, m));
const CATEGORIES = Object.keys(CAPACITY) as PlaceCategory[];

/** A whole building (an OSM way) and a venue inside one (an OSM node). */
const building = (category: PlaceCategory, n = 1) => ({ id: `w${n}`, category });
const venue = (category: PlaceCategory, n = 1) => ({ id: `n${n}`, category });

describe("capacity", () => {
  it("gives a whole building its category's capacity and a venue inside one a tenth", () => {
    expect(capacityOf(building("dining"))).toBe(1000);
    expect(capacityOf({ id: "r4054634", category: "library" })).toBe(1200);
    expect(capacityOf(venue("dining"))).toBe(100);
    // fixture ids ("fx-…") are not OSM points, so they count as buildings
    expect(capacityOf({ id: "fx-north-hall", category: "dining" })).toBe(1000);
  });
});

describe("crowd levels", () => {
  it.each([
    [0, 0],
    [1, 1],
    [199, 1],
    [200, 2],
    [499, 2],
    [500, 3],
    [799, 3],
    [800, 4],
    [1000, 4],
    [5000, 4],
  ] as const)("a dining commons with %i people is level %i", (count, level) => {
    expect(levelFor(count, building("dining"))).toBe(level);
  });

  it("reads the same head count against the size of the place", () => {
    expect(levelFor(90, venue("dining"))).toBe(4);
    expect(levelFor(90, building("other"))).toBe(3);
    expect(levelFor(90, building("residence"))).toBe(1);
    expect(levelFor(90, building("dining"))).toBe(1);
  });

  it("starts busy at half of capacity for every kind of place", () => {
    for (const place of CATEGORIES.flatMap((c) => [building(c), venue(c)])) {
      const half = capacityOf(place) * 0.5;
      expect(levelFor(half - 1, place)).toBe(2);
      expect(levelFor(half, place)).toBe(3);
    }
  });
});

describe("simulated counts against capacity", () => {
  const commons = Array.from({ length: 40 }, (_, i) => building("dining", i));
  const cafes = Array.from({ length: 40 }, (_, i) => venue("dining", i));

  it("fills the busiest dining commons at lunch and empties them overnight", () => {
    const lunch = commons.map((h) => simulatedCount(h, tuesday(12, 30)));
    expect(Math.max(...lunch)).toBeGreaterThanOrEqual(800);
    expect(new Set(lunch.map((n, i) => levelFor(n, commons[i])))).toContain(4);
    // the least popular ones are well short of busy even at the peak
    expect(Math.min(...lunch)).toBeLessThan(500);

    const night = commons.map((h) => simulatedCount(h, tuesday(3)));
    expect(night.every((n, i) => levelFor(n, commons[i]) <= 1)).toBe(true);
  });

  it("keeps a café to café numbers, and still packs it at lunch", () => {
    const lunch = cafes.map((c) => simulatedCount(c, tuesday(12, 30)));
    expect(Math.max(...lunch)).toBeLessThanOrEqual(120);
    expect(new Set(lunch.map((n, i) => levelFor(n, cafes[i])))).toContain(4);
  });

  it("never runs far over capacity", () => {
    for (const place of CATEGORIES.flatMap((c) => [building(c), venue(c)])) {
      for (let h = 0; h < 24; h++) {
        expect(simulatedCount(place, tuesday(h, 5))).toBeLessThanOrEqual(capacityOf(place) * 1.2);
      }
    }
  });
});

describe("heat weight", () => {
  it("fills the scale at 600 simulated people or 50 live ones", () => {
    expect(heatWeight(300, "simulated")).toBe(0.5);
    expect(heatWeight(3000, "simulated")).toBe(1);
    expect(heatWeight(5, "live")).toBe(0.1);
    expect(heatWeight(80, "live")).toBe(1);
  });
});
