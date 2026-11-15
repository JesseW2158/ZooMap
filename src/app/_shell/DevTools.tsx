"use client";

import { publicEnv } from "@/shared/config/public-env";
import { useUserLocation } from "@/shared/platform";

/** Click-to-set-location override. Renders nothing unless NEXT_PUBLIC_DEV_TOOLS=1. */
export function DevTools() {
  const { position, source, isDevPicking, setDevPicking, setDevLocation } = useUserLocation();
  if (!publicEnv.devTools) return null;

  return (
    <div
      className={
        // Phones (below 768 px, the shell's desktop breakpoint): bottom-right, level with the crowd
        // legend's "Map: …" button (the legend's bottom offset), in two short lines so it fits
        // beside the legend; z-[5] like the legend, so the map sheet (z-[8]) covers it when pulled up.
        // Larger screens: top-left of the map, beside the sidebar, on one line.
        "fixed bottom-[max(calc(var(--map-attrib-clear,1.5rem)_+_2.75rem),calc(env(safe-area-inset-bottom)_+_6rem_+_var(--map-inset-bottom,0px)))] right-3 " +
        "md:absolute md:bottom-auto md:right-auto md:left-[calc(var(--map-inset-left,0px)+0.75rem)] md:top-16 " +
        "z-[5] md:z-10 flex flex-col items-start gap-1 md:flex-row md:items-center md:gap-2 " +
        "rounded-xl bg-amber-100/95 px-2 py-2 md:px-3 text-xs text-amber-900 shadow-md"
      }
    >
      {/* Phones: "DEV · Set my location" on the first line, the location text under it. */}
      <div className="flex items-center gap-2">
        <span className="font-semibold">DEV</span>
        <button
          type="button"
          className="rounded-md bg-amber-300 px-2 py-1 font-medium"
          onClick={() => setDevPicking(!isDevPicking)}
        >
          {isDevPicking ? "Tap the map…" : "Set my location"}
        </button>
        {source === "dev" ? (
          <button type="button" className="underline" onClick={() => setDevLocation(null)}>
            Clear
          </button>
        ) : null}
      </div>
      <span className="text-amber-700">
        {position ? `${source}: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : "no location"}
      </span>
    </div>
  );
}
