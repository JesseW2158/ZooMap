import { describe, expect, it } from "vitest";
import { offsetM } from "@/shared/geo";
import { isInRange, isVerifying, pendingPoints, secondsToAdd } from "./rules";

const T = new Date("2026-11-14T15:00:00Z");
const at = (s: number) => new Date(T.getTime() + s * 1000);
const center = { lat: 42.3897, lng: -72.5283 };

describe("verified-time rules", () => {
  it("adds the gap since the previous in-range ping only when it is under 300 s", () => {
    expect(secondsToAdd(undefined, at(10))).toBe(0);
    expect(secondsToAdd(T, at(60))).toBe(60);
    expect(secondsToAdd(T, at(299))).toBe(299);
    expect(secondsToAdd(T, at(300))).toBe(0);
    expect(secondsToAdd(T, at(900))).toBe(0);
    expect(secondsToAdd(at(60), T)).toBe(0); // out of order
  });

  it("is verifying while the last in-range ping is under 300 s old", () => {
    expect(isVerifying(undefined, T)).toBe(false);
    expect(isVerifying(T, at(299))).toBe(true);
    expect(isVerifying(T, at(300))).toBe(false);
  });

  it("is in range within 150 m of the centre, or at the same place, or always when the geofence is off", () => {
    const activity = { placeId: "fx-dubois", center };
    const near = { position: offsetM(center, 100, 0), placeId: null };
    const far = { position: offsetM(center, 400, 0), placeId: null };
    expect(isInRange(near, activity, true)).toBe(true);
    expect(isInRange(far, activity, true)).toBe(false);
    expect(isInRange({ ...far, placeId: "fx-dubois" }, activity, true)).toBe(true);
    expect(isInRange({ ...far, placeId: "fx-ilc" }, activity, true)).toBe(false);
    expect(isInRange(far, activity, false)).toBe(true);
    expect(isInRange(near, { placeId: "gone", center: null }, true)).toBe(false);
  });

  it("pays whole minutes", () => {
    expect(pendingPoints(59, 1)).toBe(0);
    expect(pendingPoints(125, 1)).toBe(2);
    expect(pendingPoints(125, 10)).toBe(20);
  });
});
