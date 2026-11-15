import { describe, expect, it } from "vitest";
import { pinFeatures, pinRadiusAt, pinTopM } from "./pins3d";

const at = { lat: 42.3868, lng: -72.5301 };

describe("3D pins", () => {
  it("stacks slices from the ground to the top of the head", () => {
    const { features } = pinFeatures([{ id: "a", at, color: "#fff" }]);
    const bottoms = features.map((f) => f.properties!.bottom as number);
    const tops = features.map((f) => f.properties!.top as number);
    expect(Math.min(...bottoms)).toBe(0);
    expect(Math.max(...tops)).toBeCloseTo(pinTopM(), 5);
    for (let i = 1; i < features.length; i++) expect(bottoms[i]).toBeCloseTo(tops[i - 1]!, 5);
  });

  it("has a thin tip, a wide head and a rounded top", () => {
    expect(pinRadiusAt(0)).toBeLessThan(1);
    expect(pinRadiusAt(19)).toBeCloseTo(5.5, 5);
    expect(pinRadiusAt(24.4)).toBeLessThan(3);
  });

  it("scales every dimension with the pin", () => {
    const small = pinFeatures([{ id: "a", at, color: "#fff" }]).features;
    const big = pinFeatures([{ id: "a", at, color: "#fff", scale: 2 }]).features;
    expect(Math.max(...big.map((f) => f.properties!.top as number))).toBeCloseTo(
      2 * Math.max(...small.map((f) => f.properties!.top as number)),
      5,
    );
  });

  it("fans out pins that share a place so none hides another", () => {
    const { features } = pinFeatures([
      { id: "a", at, color: "#fff" },
      { id: "b", at, color: "#000" },
    ]);
    const lng = (id: string) => features.find((f) => f.properties!.id === id)!.geometry.coordinates[0]![0]![0]!;
    expect(lng("a")).not.toBeCloseTo(lng("b"), 6);
  });

  it("carries extra properties for picking", () => {
    const { features } = pinFeatures([{ id: "a", at, color: "#fff", props: { placeId: "p1" } }]);
    expect(features[0]!.properties!.placeId).toBe("p1");
  });
});
