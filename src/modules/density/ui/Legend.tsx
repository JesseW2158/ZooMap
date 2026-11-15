"use client";

import type { DensityResponse } from "@/shared/contracts";
import { useStore } from "@/shared/ui/store";
import { rampGradient } from "./levels";
import { modeById } from "./modes";
import { densityStore } from "./state";

/** Colour key for the active scale. Says "includes simulated data" whenever the snapshot does. */
export function Legend({ snapshot }: { snapshot: DensityResponse | null }) {
  const mode = modeById(useStore(densityStore, (s) => s.mode));
  if (!mode.ramp) return null;

  return (
    <div className="rounded-lg bg-neutral-50 px-2 py-1.5">
      <div className="h-2 rounded-full" style={{ background: rampGradient(mode.ramp) }} />
      <div className="mt-0.5 flex justify-between text-[10px] leading-4 text-neutral-600">
        <span>Quiet</span>
        <span>Crowded</span>
      </div>
      {snapshot?.hasSimulated ? <div className="text-[10px] leading-4 text-neutral-500">Includes simulated data</div> : null}
    </div>
  );
}
