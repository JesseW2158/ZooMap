"use client";

import { publicEnv } from "@/shared/config/public-env";
import { useUserLocation } from "@/shared/platform";

/** Click-to-set-location override, in the bottom-right of the map above its attribution. Renders nothing unless NEXT_PUBLIC_DEV_TOOLS=1. */
export function DevTools() {
  const { position, source, isDevPicking, setDevPicking, setDevLocation } = useUserLocation();
  if (!publicEnv.devTools) return null;

  return (
    <div className="absolute bottom-16 right-3 z-10 flex items-center gap-2 rounded-xl bg-amber-100/95 px-3 py-2 text-xs text-amber-900 shadow-md">
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
