import type { DensityLevel, DensityResponse, Place } from "@/shared/contracts";

const levelFor = (count: number): DensityLevel => (count === 0 ? 0 : count < 10 ? 1 : count < 25 ? 2 : count < 40 ? 3 : 4);

const COUNTS = [48, 22, 15, 9, 31, 40, 5, 12];

/** Made-up counts, labelled simulated, so the panel and legend have something to show. */
export function densitySnapshotFixture(places: Place[], now: Date): DensityResponse {
  const rows = places.map((p, i) => {
    const simulated = COUNTS[i % COUNTS.length];
    return { placeId: p.id, count: simulated, live: 0, simulated, level: levelFor(simulated) };
  });
  return {
    generatedAt: now.toISOString(),
    hasSimulated: true,
    points: places.map((p, i) => ({
      lat: p.center.lat,
      lng: p.center.lng,
      weight: rows[i].count / 50,
      source: "simulated" as const,
    })),
    places: rows,
  };
}
