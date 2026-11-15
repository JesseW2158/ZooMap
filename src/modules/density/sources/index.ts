import type { DensitySource } from "@/shared/contracts";
import { env } from "@/shared/config/env";
import { liveSource } from "./live";
import { simulatedSource } from "./simulated";

/** Registry of density sources: a new one is a file plus a line here. Ids are "live" or "simulated". */
export const densitySources: { source: DensitySource; enabled: () => boolean }[] = [
  { source: liveSource, enabled: () => true },
  { source: simulatedSource, enabled: () => env().simulatedDensity },
];
