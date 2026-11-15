import type { DensityResponse, Place } from "@/shared/contracts";
import { heatWeight, levelFor } from "./capacity";

const COUNTS = [960, 440, 300, 180, 620, 800, 100, 240];

/** Made-up counts, labelled simulated, so the panel and legend have something to show. */
export function densitySnapshotFixture(places: Place[], now: Date): DensityResponse {
  const rows = places.map((p, i) => {
    const simulated = COUNTS[i % COUNTS.length];
    return { placeId: p.id, count: simulated, live: 0, simulated, level: levelFor(simulated, p) };
  });
  return {
    generatedAt: now.toISOString(),
    hasSimulated: true,
    points: places.map((p, i) => ({
      lat: p.center.lat,
      lng: p.center.lng,
      weight: heatWeight(rows[i].count, "simulated"),
      source: "simulated" as const,
    })),
    places: rows,
  };
}
