"use client";

import type { DensityResponse } from "@/shared/contracts";
import { LEVEL_COLORS, LEVEL_LABELS } from "./levels";

/** Colour key for the heatmap. Says "includes simulated data" whenever the snapshot does. */
export function Legend({ snapshot, overlay = false }: { snapshot: DensityResponse | null; overlay?: boolean }) {
  const box = overlay
    ? "pointer-events-none absolute left-3 top-[calc(env(safe-area-inset-top)+3.3rem)] z-[5] rounded-lg bg-white/85 px-2 py-1.5 shadow-sm"
    : "rounded-lg bg-neutral-50 px-2 py-1.5";
  return (
    <div className={box} aria-label="Crowd legend">
      <div className="flex items-center gap-1 text-[10px] leading-4 text-neutral-600">
        {LEVEL_LABELS.slice(1).map((label, i) => (
          <span key={label} className="flex items-center gap-0.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: LEVEL_COLORS[i + 1] }} />
            {label}
          </span>
        ))}
      </div>
      {snapshot?.hasSimulated ? <div className="text-[10px] leading-4 text-neutral-500">Includes simulated data</div> : null}
    </div>
  );
}
