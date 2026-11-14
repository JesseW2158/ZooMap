import { RAMP, rampColor } from "./field";

/** Colour for each density level 0-4 (the panel's swatches): points along the same green-to-red ramp as the map. */
export const LEVEL_COLORS = [0, 0.2, 0.4, 0.65, 0.9].map(rampColor) as readonly string[];
export const LEVEL_LABELS = ["Empty", "Quiet", "Moderate", "Busy", "Packed"] as const;

/** CSS gradient of the whole ramp, left (quiet) to right (crowded). */
export const RAMP_GRADIENT = `linear-gradient(to right, ${RAMP.map(([d, [r, g, b]]) => `rgb(${r},${g},${b}) ${(d / RAMP[RAMP.length - 1][0]) * 100}%`).join(", ")})`;
