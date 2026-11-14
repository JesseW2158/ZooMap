"use client";

import { useStore } from "@/shared/ui/store";
import { HEAT_MODES } from "./modes";
import { densityStore, setHeatMode } from "./state";

/** The map modes as a list of radio buttons. `onPick` lets a popover close itself. */
export function ModePicker({ onPick, showHints = true }: { onPick?: () => void; showHints?: boolean }) {
  const mode = useStore(densityStore, (s) => s.mode);
  return (
    <div role="radiogroup" aria-label="Map colours" className="flex flex-col gap-1">
      {HEAT_MODES.map((m) => {
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
            className={`rounded-lg border px-3 py-1.5 text-left text-sm ${
              selected ? "border-[#881c1c] bg-[#881c1c]/10 font-medium text-neutral-900" : "border-neutral-200 bg-white text-neutral-700"
            }`}
          >
            {m.label}
            {showHints ? <span className="block text-xs font-normal text-neutral-500">{m.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
