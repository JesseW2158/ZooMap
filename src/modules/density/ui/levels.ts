import { RAMPS, rampColor, type RampId } from "./field";

/** Colour for each density level 0-4 (the panel's swatches): points along the active ramp. */
export const levelColors = (ramp: RampId): readonly string[] => [0, 0.2, 0.4, 0.65, 0.9].map((d) => rampColor(d, ramp));
export const LEVEL_LABELS = ["Empty", "Quiet", "Moderate", "Busy", "Packed"] as const;

/** CSS gradient of a whole ramp, left (quiet) to right (crowded). */
export function rampGradient(ramp: RampId): string {
  const stops = RAMPS[ramp];
  const end = stops[stops.length - 1][0];
  return `linear-gradient(to right, ${stops.map(([d, [r, g, b]]) => `rgb(${r},${g},${b}) ${(d / end) * 100}%`).join(", ")})`;
}
