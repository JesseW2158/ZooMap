"use client";

import { useStore } from "@/shared/ui/store";
import { publicEnv } from "@/shared/config/public-env";
import { availableModes } from "./modes";
import { densityStore, setHeatMode } from "./state";

/** The map modes as a list of radio buttons. `onPick` lets a popover close itself. */
export function ModePicker({ onPick, showHints = true }: { onPick?: () => void; showHints?: boolean }) {
  const mode = useStore(densityStore, (s) => s.mode);
  return (
    <div role="radiogroup" aria-label="Map colours" className="flex flex-col gap-1">
      {availableModes(publicEnv.devTools).map((m) => {
        const selected = m.id === mode;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              setHeatMode(m.id);
              onPick?.();
            }}
            className={`zm-press flex items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
              selected
                ? "border-ink bg-ink/[0.04] font-semibold text-ink shadow-sm"
                : "border-ash/50 bg-white text-ink hover:border-ash hover:bg-linen/60"
            }`}
          >
            {/* the radio dot */}
            <span
              aria-hidden
              className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                selected ? "border-ink" : "border-ash"
              }`}
            >
              <span className={`size-2 rounded-full bg-ink transition-transform duration-200 ${selected ? "scale-100" : "scale-0"}`} />
            </span>
            <span className="min-w-0">
              {m.label}
              {showHints ? <span className="block text-xs font-normal text-yale/80">{m.hint}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
