"use client";

import { useState } from "react";
import { useMapStore, usePolling } from "@/shared/ui";
import { useStore } from "@/shared/ui/store";
import { startLocation } from "@/shared/platform";
import { Legend } from "./Legend";
import { levelColors, LEVEL_LABELS } from "./levels";
import { ModePicker } from "./ModePicker";
import { modeById } from "./modes";
import { densityStore, introSeen, loadSharing, markIntroSeen, updateSharing } from "./state";

/** Crowd panel: what is shared, the sharing switch, and the busiest places right now. */
export function DensityPanel() {
  const snapshot = useStore(densityStore, (s) => s.snapshot);
  const sharing = useStore(densityStore, (s) => s.sharing);
  const names = useStore(densityStore, (s) => s.names);
  const error = useStore(densityStore, (s) => s.error);
  const mode = useStore(densityStore, (s) => s.mode);
  const colors = levelColors(modeById(mode).ramp ?? "green");
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
    <div className="space-y-4 text-sm text-ink">
      {intro ? (
        <div className="animate-rise relative space-y-2 overflow-hidden rounded-2xl bg-gradient-to-br from-lavender/35 via-white to-white p-4 shadow-sm ring-1 ring-lavender/50">
          <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-lavender/30 blur-xl" />
          <h2 className="relative text-base font-bold tracking-tight">Help show how busy campus is</h2>
          <p className="relative leading-relaxed text-yale">
            If you share your location, Minute Map records which building you are near, about every minute, and counts you in the crowd
            map. It keeps only that building and an approximate area, never your exact position, and never a history. It forgets you
            ten minutes after your last update, or at once when you switch sharing off. Other people see only totals per building.
          </p>
          <div className="relative flex gap-2 pt-1">
            <button type="button" onClick={turnOn} className="zm-press rounded-full bg-gradient-to-br from-[#a12424] to-[#6f1616] px-4 py-2 font-semibold text-white shadow-md shadow-[#881c1c]/30 hover:shadow-lg">
              Share my location
            </button>
            <button type="button" onClick={notNow} className="zm-press rounded-full bg-linen px-4 py-2 font-medium text-yale hover:bg-ash/40">
              Not now
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 rounded-2xl bg-linen/70 p-3">
        <div>
          <h2 className="text-base font-bold tracking-tight">Crowd density</h2>
          <p className="text-xs text-yale">
            <span aria-hidden className={`mr-1.5 inline-block size-2 rounded-full align-middle ${sharing ? "animate-pulse bg-[#118a5b]" : "bg-ash"}`} />
            {sharing ? "You are counted in the crowd." : "You are not sharing your location."}
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-yale">
          Share my location
          {/* a checkbox drawn as a sliding switch: the knob is a background circle that moves when checked */}
          <input
            type="checkbox"
            role="switch"
            className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-ash/70 bg-[radial-gradient(circle,#fff_0,#fff_8px,transparent_9px)] bg-[length:24px_24px] bg-[position:0_0] bg-no-repeat shadow-inner transition-all duration-200 checked:bg-[#881c1c] checked:bg-[position:20px_0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50"
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

      <div className="space-y-1.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-yale">Map colours</h3>
        <ModePicker />
      </div>

      <Legend snapshot={snapshot} />
      {error && !snapshot ? <p className="text-xs text-red-700">{error}</p> : null}

      {rows.length ? (
        <ul className="zm-stagger space-y-1">
          {rows.map((p) => (
            <li key={p.placeId}>
              <button
                type="button"
                className="zm-press group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-linen"
                onClick={() => selectPlace(p.placeId)}
              >
                <span
                  className="inline-block size-3 shrink-0 rounded-full ring-2 ring-white shadow-[0_0_0_1px_rgb(21_50_67/0.1)]"
                  style={{ background: colors[p.level] }}
                />
                <span className="min-w-0 flex-1 truncate font-medium">{names[p.placeId]}</span>
                <span className="text-xs text-yale/80 group-hover:text-yale">
                  {LEVEL_LABELS[p.level]}
                  {p.live > 0 ? ` · ${p.live} live` : ""}
                  {p.simulated > 0 ? " · simulated" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`text-xs text-yale ${snapshot ? "" : "animate-pulse"}`}>{snapshot ? "Nobody is counted anywhere yet." : "Loading crowd data..."}</p>
      )}
    </div>
  );
}
