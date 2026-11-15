import type { DensityLevel, DensityPlace, DensityPoint, DensityResponse, Place } from "@/shared/contracts";
import { getPlaces } from "@/modules/campus";
import { densitySources } from "./sources";

export { getSharing, recordPing, setSharing } from "./presence";
export * as fixtures from "./fixtures";

/**
 * Density module (owner: density). Sums the registered sources per place, keeping live and
 * simulated apart so the UI can label simulated data.
 */

export const levelFor = (count: number): DensityLevel => (count <= 0 ? 0 : count < 10 ? 1 : count < 25 ? 2 : count < 40 ? 3 : 4);

/** 50 people fills the heat scale. */
const weightFor = (count: number) => Math.min(1, count / 50);

const CACHE_MS = 5_000;
let cache: { at: number; value: DensityResponse } | null = null;

export async function buildSnapshot(places: Place[], now: Date): Promise<DensityResponse> {
  const tally = new Map<string, { live: number; simulated: number }>();
  let hasSimulated = false;
  for (const { source, enabled } of densitySources) {
    if (!enabled()) continue;
    const kind = source.id === "simulated" ? "simulated" : "live";
    if (kind === "simulated") hasSimulated = true;
    for (const { placeId, count } of await source.getCounts(now)) {
      const row = tally.get(placeId) ?? { live: 0, simulated: 0 };
      row[kind] += count;
      tally.set(placeId, row);
    }
  }

  const rows: DensityPlace[] = [];
  const points: DensityPoint[] = [];
  for (const place of places) {
    const t = tally.get(place.id);
    if (!t) continue;
    const count = t.live + t.simulated;
    rows.push({ placeId: place.id, count, live: t.live, simulated: t.simulated, level: levelFor(count) });
    if (t.live > 0) points.push({ ...place.center, weight: weightFor(t.live), source: "live" });
    if (t.simulated > 0) points.push({ ...place.center, weight: weightFor(t.simulated), source: "simulated" });
  }
  return { generatedAt: now.toISOString(), hasSimulated, points, places: rows };
}

/** Passing `now` skips the five-second cache (tests, and callers that need an exact moment). */
export async function getDensitySnapshot(now?: Date): Promise<DensityResponse> {
  if (now) return buildSnapshot(await getPlaces(), now);
  const t = Date.now();
  if (cache && t - cache.at < CACHE_MS) return cache.value;
  const value = await buildSnapshot(await getPlaces(), new Date(t));
  cache = { at: t, value };
  return value;
}
