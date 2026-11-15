import type { DensityPoint, LatLng } from "@/shared/contracts";

/**
 * The crowd field: how crowded the map is at any spot, from quiet to crowded.
 *
 * MapLibre draws it as a heatmap layer; this file computes the same number in JavaScript so a
 * building can be painted the colour of the ground under it. Both use MapLibre's kernel:
 *   density(p) = intensity * sum( weight_i * 0.39894 * exp(-4.5 * (distance_i / radius)^2) )
 * with a radius fixed in metres, so the field looks the same at every zoom.
 */

export const FIELD_RADIUS_M = 130;
export const FIELD_INTENSITY = 3.2;
const GAUSS_COEF = 0.3989422804014327;

type Rgb = readonly [number, number, number];
export type RampId = "green" | "gray";

/** Colour stops of each scale, as [density, [r, g, b]]. Density past the last stop keeps its colour. */
export const RAMPS: Record<RampId, readonly (readonly [number, Rgb])[]> = {
  green: [
    [0, [63, 174, 90]], // quiet
    [0.2, [150, 205, 80]],
    [0.4, [245, 211, 63]],
    [0.65, [240, 138, 44]],
    [0.9, [214, 45, 32]], // crowded
  ],
  gray: [
    [0, [128, 128, 128]], // quiet: a mid gray, darker than the map's own light stone
    [0.3, [178, 130, 112]],
    [0.55, [222, 96, 64]],
    [0.9, [208, 34, 28]], // crowded
  ],
};

const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
const toHex = ([r, g, b]: readonly number[]) => `#${hex(r)}${hex(g)}${hex(b)}`;

export function rampColor(density: number, ramp: RampId = "green"): string {
  const stops = RAMPS[ramp];
  const last = stops[stops.length - 1];
  const d = Math.max(0, Math.min(last[0], density));
  for (let i = 1; i < stops.length; i++) {
    const [d1, c1] = stops[i];
    if (d <= d1) {
      const [d0, c0] = stops[i - 1];
      const t = (d - d0) / (d1 - d0);
      return toHex([c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t]);
    }
  }
  return toHex(last[1]);
}

/** Weight of one point in the field. The API weight is a head count scaled to 0..1 (`heatWeight` on the server). */
export const pointWeight = (apiWeight: number) => Math.min(1, apiWeight);

/**
 * The heat-layer colour ramp as a MapLibre expression, same stops as `rampColor`.
 * `translucent` fades the quiet end out, so the map underneath (the grass) shows through
 * wherever it is quiet and the heat only appears where people are.
 */
export function rampExpression(ramp: RampId, translucent = false): unknown[] {
  const stops = RAMPS[ramp];
  return [
    "interpolate",
    ["linear"],
    ["heatmap-density"],
    ...stops.flatMap(([d, [r, g, b]], i) => {
      const alpha = translucent ? (i === 0 ? 0 : 0.3 + 0.6 * (i / (stops.length - 1))) : 1;
      return [d, `rgba(${r},${g},${b},${alpha})`];
    }),
  ];
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
