"use client";

import { useState } from "react";
import type { DensityResponse } from "@/shared/contracts";
import { useStore } from "@/shared/ui/store";
import { rampGradient } from "./levels";
import { ModePicker } from "./ModePicker";
import { modeById } from "./modes";
import { densityStore } from "./state";

/** Colour key for the active scale. Says "includes simulated data" whenever the snapshot does. */
export function Legend({ snapshot, overlay = false }: { snapshot: DensityResponse | null; overlay?: boolean }) {
  const mode = modeById(useStore(densityStore, (s) => s.mode));
  const [open, setOpen] = useState(false);

  const key = mode.ramp ? (
    <div className={overlay ? "w-44" : "w-full"}>
      <div className="h-2 rounded-full" style={{ background: rampGradient(mode.ramp) }} />
      <div className="mt-0.5 flex justify-between text-[10px] leading-4 text-neutral-600">
        <span>Quiet</span>
        <span>Crowded</span>
      </div>
      {snapshot?.hasSimulated ? <div className="text-[10px] leading-4 text-neutral-500">Includes simulated data</div> : null}
    </div>
  ) : null;

  if (!overlay) return key ? <div className="rounded-lg bg-neutral-50 px-2 py-1.5">{key}</div> : null;

  return (
    // Absolute in the map area (which already ends above the tab bar and the home indicator), so
    // no inset is needed. It sits one row above the attribution row (the credit's clearance from
    // the map edge, --map-attrib-clear in globals.css, plus its 10px margin and 24px height, plus
    // a gap) so a long mode label and the expanded credit can never share a row.
    <div className="pointer-events-none absolute bottom-[calc(var(--map-attrib-clear,1.5rem)+2.75rem)] left-3 z-[5] flex flex-col items-start gap-1.5">
      {key ? <div className="rounded-lg bg-white/90 px-2 py-1.5 shadow-sm">{key}</div> : null}
      {open ? (
        <div className="pointer-events-auto w-56 rounded-xl bg-white/95 p-2 shadow-lg">
          <ModePicker showHints={false} onPick={() => setOpen(false)} />
        </div>
      ) : null}
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-neutral-800 shadow"
      >
        <span className="inline-block size-2.5 rounded-full" style={{ background: mode.ramp ? "#d62d20" : "#a3a3a3" }} />
        Map: {mode.label}
      </button>
    </div>
  );
}
