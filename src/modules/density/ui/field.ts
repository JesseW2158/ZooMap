import type { DensityPoint, LatLng } from "@/shared/contracts";

/**
 * The crowd field: how crowded the map is at any spot, green (quiet) to red (crowded).
 *
 * MapLibre draws it as a heatmap layer; this file computes the same number in JavaScript so a
 * building can be painted the colour of the ground under it. Both use MapLibre's kernel:
 *   density(p) = intensity * sum( weight_i * 0.39894 * exp(-4.5 * (distance_i / radius)^2) )
 * with a radius fixed in metres, so the field looks the same at every zoom.
 */

export const FIELD_RADIUS_M = 130;
export const FIELD_INTENSITY = 3.2;
const GAUSS_COEF = 0.3989422804014327;

/** Colour stops of the field, as [density, [r, g, b]]. Density past the last stop stays at its colour. */
export const RAMP: readonly (readonly [number, readonly [number, number, number]])[] = [
  [0, [63, 174, 90]], // green: quiet
  [0.2, [150, 205, 80]],
  [0.4, [245, 211, 63]], // yellow
  [0.65, [240, 138, 44]], // orange
  [0.9, [214, 45, 32]], // red: crowded
];

const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");

export function rampColor(density: number): string {
  const d = Math.max(0, Math.min(RAMP[RAMP.length - 1][0], density));
  for (let i = 1; i < RAMP.length; i++) {
    const [d1, c1] = RAMP[i];
    if (d <= d1) {
      const [d0, c0] = RAMP[i - 1];
      const t = (d - d0) / (d1 - d0);
      return `#${hex(c0[0] + (c1[0] - c0[0]) * t)}${hex(c0[1] + (c1[1] - c0[1]) * t)}${hex(c0[2] + (c1[2] - c0[2]) * t)}`;
    }
  }
  const last = RAMP[RAMP.length - 1][1];
  return `#${hex(last[0])}${hex(last[1])}${hex(last[2])}`;
}

/** Weight of one point in the field. The API weight is count / 50, capped at 1. */
export const pointWeight = (apiWeight: number) => Math.min(1, apiWeight);

/** The heat-layer colour ramp as a MapLibre expression, same stops as `rampColor`. */
export function rampExpression(): unknown[] {
  return ["interpolate", ["linear"], ["heatmap-density"], ...RAMP.flatMap(([d, [r, g, b]]) => [d, `rgb(${r},${g},${b})`])];
}

const M_PER_DEG_LAT = 110_540;

export function densityAt(points: readonly DensityPoint[], at: LatLng): number {
  const kx = 111_320 * Math.cos((at.lat * Math.PI) / 180);
  const reach2 = FIELD_RADIUS_M * FIELD_RADIUS_M;
  let sum = 0;
  for (const p of points) {
    const dx = (p.lng - at.lng) * kx;
    const dy = (p.lat - at.lat) * M_PER_DEG_LAT;
    const d2 = dx * dx + dy * dy;
    if (d2 >= reach2) continue;
    sum += pointWeight(p.weight) * GAUSS_COEF * Math.exp((-4.5 * d2) / reach2);
  }
  return sum * FIELD_INTENSITY;
}
