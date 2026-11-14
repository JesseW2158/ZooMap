import { describe, expect, it } from "vitest";
import { fromLngLat, haversineM, offsetM, pathLengthM, toLngLat } from "./geo";

const CENTER = { lat: 42.3868, lng: -72.5301 };

describe("geo", () => {
  it("haversine: zero for the same point, ~111.2 km per degree of latitude", () => {
    expect(haversineM(CENTER, CENTER)).toBe(0);
    expect(haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2);
  });

  it("offsetM round-trips with haversine", () => {
    const p = offsetM(CENTER, 300, -400);
    expect(haversineM(CENTER, p)).toBeCloseTo(500, 0);
    expect(p.lat).toBeLessThan(CENTER.lat);
    expect(p.lng).toBeGreaterThan(CENTER.lng);
  });

  it("converts between {lat,lng} and [lng,lat]", () => {
    expect(toLngLat(CENTER)).toEqual([-72.5301, 42.3868]);
    expect(fromLngLat(toLngLat(CENTER))).toEqual(CENTER);
  });

  it("pathLengthM sums the segments", () => {
    const a = toLngLat(CENTER);
    const b = toLngLat(offsetM(CENTER, 100, 0));
    const c = toLngLat(offsetM(CENTER, 100, 100));
    expect(pathLengthM([a, b, c])).toBeCloseTo(200, 0);
    expect(pathLengthM([a])).toBe(0);
  });
});
