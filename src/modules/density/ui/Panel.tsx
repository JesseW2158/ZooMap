"use client";

import { useState } from "react";
import { useMapStore, usePolling } from "@/shared/ui";
import { useStore } from "@/shared/ui/store";
import { startLocation } from "@/shared/platform";
import { Legend } from "./Legend";
import { LEVEL_COLORS, LEVEL_LABELS } from "./levels";
import { densityStore, introSeen, loadSharing, markIntroSeen, setHeatOn, updateSharing } from "./state";

/** Crowd panel: what is shared, the sharing switch, and the busiest places right now. */
export function DensityPanel() {
  const snapshot = useStore(densityStore, (s) => s.snapshot);
  const sharing = useStore(densityStore, (s) => s.sharing);
  const names = useStore(densityStore, (s) => s.names);
  const error = useStore(densityStore, (s) => s.error);
  const heatOn = useStore(densityStore, (s) => s.heatOn);
  const { selectPlace } = useMapStore();
  const [introDismissed, setIntroDismissed] = useState(introSeen);
  // first run: explain before asking, but only to people who have not opted in
  const intro = sharing === false && !introDismissed;

  usePolling((signal) => loadSharing(signal), { intervalMs: null });

  const turnOn = async () => {
    markIntroSeen();
    setIntroDismissed(true);
    startLocation(); // from the tap, so the browser may ask for permission
    await updateSharing(true);
  };
  const notNow = () => {
    markIntroSeen();
    setIntroDismissed(true);
  };

  const rows = [...(snapshot?.places ?? [])]
    .filter((p) => p.level > 0 && names[p.placeId])
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <div className="space-y-3 text-sm">
      {intro ? (
        <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
          <h2 className="text-base font-semibold">Help show how busy campus is</h2>
          <p className="text-neutral-600">
            If you share your location, ZooMap records which building you are near, about every minute, and counts you in the crowd
            map. It keeps only that building and an approximate area, never your exact position, and never a history. It forgets you
            ten minutes after your last update, or at once when you switch sharing off. Other people see only totals per building.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={turnOn} className="rounded-lg bg-[#881c1c] px-3 py-1.5 font-medium text-white">
              Share my location
            </button>
            <button type="button" onClick={notNow} className="rounded-lg bg-neutral-100 px-3 py-1.5 text-neutral-700">
              Not now
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Crowd density</h2>
          <p className="text-xs text-neutral-500">
            {sharing ? "You are counted in the crowd." : "You are not sharing your location."}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-neutral-700">
          Share my location
          <input
            type="checkbox"
            role="switch"
            className="size-5 accent-[#881c1c]"
            checked={sharing === true}
            disabled={sharing === null}
            onChange={(e) => {
              if (e.target.checked) {
                markIntroSeen();
                startLocation();
              }
              void updateSharing(e.target.checked);
            }}
          />
        </label>
      </div>

      <label className="flex items-center justify-between gap-3 text-xs text-neutral-700">
        <span>
          Heatmap
          <span className="block text-neutral-500">Colours the whole campus green (quiet) to red (crowded).</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="size-5 shrink-0 accent-[#881c1c]"
          checked={heatOn}
          onChange={(e) => setHeatOn(e.target.checked)}
        />
      </label>

      <Legend snapshot={snapshot} />
      {error && !snapshot ? <p className="text-xs text-red-700">{error}</p> : null}

      {rows.length ? (
        <ul className="divide-y divide-neutral-100">
          {rows.map((p) => (
            <li key={p.placeId}>
              <button
                type="button"
                className="flex w-full items-center gap-2 py-1.5 text-left"
                onClick={() => selectPlace(p.placeId)}
              >
                <span className="inline-block size-3 shrink-0 rounded-sm" style={{ background: LEVEL_COLORS[p.level] }} />
                <span className="min-w-0 flex-1 truncate">{names[p.placeId]}</span>
                <span className="text-xs text-neutral-500">
                  {LEVEL_LABELS[p.level]}
                  {p.live > 0 ? ` · ${p.live} live` : ""}
                  {p.simulated > 0 ? " · simulated" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-neutral-500">{snapshot ? "Nobody is counted anywhere yet." : "Loading crowd data..."}</p>
      )}
    </div>
  );
}
