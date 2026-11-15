"use client";

import { useState } from "react";
import type { DensityResponse } from "@/shared/contracts";
import { useStore } from "@/shared/ui/store";
import { rampGradient } from "./levels";
import { ModePicker } from "./ModePicker";
import { modeById } from "./modes";
import { densityStore } from "./state";

/** Above the attribution row, and above the phone's bottom sheet and the tab bar. */
export const LEGEND_BOTTOM =
  "max(calc(var(--map-attrib-clear, 1.5rem) + 2.75rem), calc(env(safe-area-inset-bottom) + 6rem + var(--map-inset-bottom, 0px)))";

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
    // Keep the legend clear of both the sheet/tab-bar stack and the MapLibre attribution row.
    // In an inline style (unlike a Tailwind class) `+` inside calc() needs spaces around it:
    // without them the browser drops `bottom` and the legend jumps to the top of the map,
    // under the Crowds pill and the search bar.
    <div
      className="pointer-events-none fixed left-[calc(var(--map-inset-left,0px)+0.75rem)] z-[5] flex flex-col items-start gap-1.5"
      style={{ bottom: LEGEND_BOTTOM }}
    >
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
