"use client";

import type { DensityResponse } from "@/shared/contracts";
import { useStore } from "@/shared/ui/store";
import { RAMP_GRADIENT } from "./levels";
import { densityStore, setHeatOn } from "./state";

/** Colour key for the heatmap. Says "includes simulated data" whenever the snapshot does. */
export function Legend({ snapshot, overlay = false }: { snapshot: DensityResponse | null; overlay?: boolean }) {
  const heatOn = useStore(densityStore, (s) => s.heatOn);
  const key = (
    <div className={overlay ? "w-44" : "w-full"}>
      <div className="h-2 rounded-full" style={{ background: RAMP_GRADIENT }} />
      <div className="mt-0.5 flex justify-between text-[10px] leading-4 text-neutral-600">
        <span>Quiet</span>
        <span>Crowded</span>
      </div>
      {snapshot?.hasSimulated ? <div className="text-[10px] leading-4 text-neutral-500">Includes simulated data</div> : null}
    </div>
  );

  if (!overlay) return <div className="rounded-lg bg-neutral-50 px-2 py-1.5">{key}</div>;

  return (
    <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+6rem)] left-3 z-[5] flex flex-col items-start gap-1.5">
      {heatOn ? <div className="rounded-lg bg-white/90 px-2 py-1.5 shadow-sm">{key}</div> : null}
      <button
        type="button"
        role="switch"
        aria-checked={heatOn}
        onClick={() => setHeatOn(!heatOn)}
        className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-neutral-800 shadow"
      >
        <span className="inline-block size-2.5 rounded-full" style={{ background: heatOn ? "#d62d20" : "#a3a3a3" }} />
        Heatmap {heatOn ? "on" : "off"}
      </button>
    </div>
  );
}
