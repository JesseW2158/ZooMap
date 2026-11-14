import { describe, expect, it } from "vitest";
import type { DensityPoint } from "@/shared/contracts";
import { densityAt, FIELD_RADIUS_M, pointWeight, rampColor } from "./ui/field";
import { HEAT_MODES } from "./ui/modes";

const at = { lat: 42.3868, lng: -72.5301 };
const point = (eastM: number, weight: number, source: DensityPoint["source"] = "simulated"): DensityPoint => ({
  lat: at.lat,
  lng: at.lng + eastM / (111_320 * Math.cos((at.lat * Math.PI) / 180)),
  weight,
  source,
});

describe("crowd field", () => {
  it("is zero with nobody around and rises with the crowd", () => {
    expect(densityAt([], at)).toBe(0);
    expect(densityAt([point(0, 0.2)], at)).toBeLessThan(densityAt([point(0, 0.8)], at));
  });

  it("fades with distance and stops at the radius", () => {
    const near = densityAt([point(10, 0.6)], at);
    const mid = densityAt([point(70, 0.6)], at);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(0);
    expect(densityAt([point(FIELD_RADIUS_M + 5, 0.6)], at)).toBe(0);
  });

  it("adds up nearby crowds", () => {
    expect(densityAt([point(20, 0.4), point(-20, 0.4)], at)).toBeGreaterThan(densityAt([point(20, 0.4)], at));
  });

  it("caps one point's weight at 1", () => {
    expect(pointWeight(3)).toBe(1);
    expect(pointWeight(0.3)).toBe(0.3);
  });

  it("colours quiet green and crowded red, and clamps past the ends", () => {
    expect(rampColor(0)).toBe("#3fae5a");
    expect(rampColor(-1)).toBe("#3fae5a");
    expect(rampColor(0.9)).toBe("#d62d20");
    expect(rampColor(5)).toBe("#d62d20");
    const mid = rampColor(0.3);
    expect(mid).not.toBe("#3fae5a");
    expect(mid).not.toBe("#d62d20");
  });

  it("has a darker gray-to-red scale that ends at the same red", () => {
    const quiet = rampColor(0, "gray");
    expect(quiet).toBe("#808080");
    // darker than the light stone the map itself uses (#d9d6cf)
    expect(parseInt(quiet.slice(1, 3), 16)).toBeLessThan(0xd9 - 40);
    expect(rampColor(0.9, "gray")).toMatch(/^#d0/);
    expect(rampColor(0.45, "gray")).not.toBe(quiet);
  });

  it("offers green-red, gray-red, gray-red on grass, and off", () => {
    expect(HEAT_MODES.map((m) => [m.id, m.ramp, m.grass])).toEqual([
      ["green-red", "green", false],
      ["gray-red", "gray", false],
      ["gray-red-grass", "gray", true],
      ["off", null, true],
    ]);
  });
});
