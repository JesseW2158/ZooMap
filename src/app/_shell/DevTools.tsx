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
        // Phones (below 768 px, the shell's desktop breakpoint): bottom-right, just above the crowd
        // legend (its offset plus 5.5rem), so the wide bar never covers the legend's mode button;
        // z-[5] like the legend, so the map sheet (z-[8]) covers it when pulled up.
        // Larger screens: top-left of the map, beside the sidebar.
        "fixed bottom-[max(calc(var(--map-attrib-clear,1.5rem)_+_8.25rem),calc(env(safe-area-inset-bottom)_+_11.5rem_+_var(--map-inset-bottom,0px)))] right-3 " +
        "md:absolute md:bottom-auto md:right-auto md:left-[calc(var(--map-inset-left,0px)+0.75rem)] md:top-16 " +
        "z-[5] md:z-10 flex items-center gap-2 rounded-xl bg-amber-100/95 px-3 py-2 text-xs text-amber-900 shadow-md"
      }
    >
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
      <span className="text-amber-700">
        {position ? `${source}: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : "no location"}
      </span>
    </div>
  );
}
