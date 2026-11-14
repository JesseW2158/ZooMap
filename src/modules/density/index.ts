import type { DensityResponse } from "@/shared/contracts";
import { getPlaces } from "@/modules/campus";
import { densitySnapshotFixture } from "./fixtures";

/**
 * Density module (owner: density). FOUNDATION STUB: returns made-up, simulated counts.
 * The owning stream sums the live and simulated sources and replaces the body; the
 * signature stays.
 */
export async function getDensitySnapshot(now: Date = new Date()): Promise<DensityResponse> {
  // FOUNDATION STUB
  return densitySnapshotFixture(await getPlaces(), now);
}
