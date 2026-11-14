"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useUserLocation } from "@/shared/platform";

/**
 * On-screen map controls with plain labels: zoom, rotate left/right, 3D/2D, a compass that
 * shows where north is (tap: face north), back to campus, find me, and a gesture help card
 * that also shows once on a first visit.
 */

const TIP_KEY = "zoomap:map-tips-seen";
export const CAMPUS_VIEW = { center: [-72.5275, 42.389] as [number, number], zoom: 16, pitch: 55, bearing: -20 };

function Btn(props: { label: string; onClick: () => void; children: ReactNode; active?: boolean; wide?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.label}
      title={props.label}
      className={`flex h-10 items-center justify-center text-[15px] font-semibold text-neutral-800 hover:bg-neutral-100 active:bg-neutral-200 ${
        props.wide ? "w-full px-2" : "w-10"
      } ${props.active ? "bg-neutral-900 text-white hover:bg-neutral-800" : ""}`}
    >
      {props.children}
    </button>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="flex flex-col divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white/95 shadow-md">{children}</div>;
}

export function MapControls({ map }: { map: MapLibreMap }) {
  const [bearing, setBearing] = useState(() => map.getBearing());
  const [pitch, setPitch] = useState(() => map.getPitch());
  const [help, setHelp] = useState(false);
  const [wantLocate, setWantLocate] = useState(false);
  const { position, start, status } = useUserLocation();

  useEffect(() => {
    const onRotate = () => setBearing(map.getBearing());
    const onPitch = () => setPitch(map.getPitch());
    map.on("rotate", onRotate);
    map.on("pitch", onPitch);
    return () => {
      map.off("rotate", onRotate);
      map.off("pitch", onPitch);
    };
  }, [map]);

  // show the gesture tips once
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(TIP_KEY) === "1";
      if (!seen) localStorage.setItem(TIP_KEY, "1");
    } catch {
      /* storage blocked: skip the first-visit tip */
    }
    if (seen) return;
    const show = setTimeout(() => setHelp(true), 0);
    const hide = setTimeout(() => setHelp(false), 9000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);

  // fly to the user once their position arrives after "Find me"
  useEffect(() => {
    if (!wantLocate || !position) return;
    map.flyTo({ center: [position.lng, position.lat], zoom: Math.max(map.getZoom(), 17.5), essential: true });
    const done = setTimeout(() => setWantLocate(false), 0);
    return () => clearTimeout(done);
  }, [wantLocate, position, map]);

  const is3d = pitch > 10;
  const ease = (opts: Parameters<MapLibreMap["easeTo"]>[0]) => map.easeTo({ duration: 450, ...opts });

  return (
    <>
      <div className="pointer-events-auto absolute right-2 top-[calc(env(safe-area-inset-top)+4rem)] z-[7] flex w-10 flex-col gap-2">
        <Group>
          <Btn label="Zoom in" onClick={() => ease({ zoom: map.getZoom() + 1 })}>+</Btn>
          <Btn label="Zoom out" onClick={() => ease({ zoom: map.getZoom() - 1 })}>−</Btn>
        </Group>
        <Group>
          <Btn label="Rotate left" onClick={() => ease({ bearing: map.getBearing() - 45 })}>⟲</Btn>
          <Btn label="Face north" onClick={() => ease({ bearing: 0 })}>
            <span className="relative block h-6 w-6" aria-hidden>
              {/* the needle points to north as the map turns */}
              <span className="absolute inset-0 flex flex-col items-center justify-between" style={{ transform: `rotate(${-bearing}deg)` }}>
                <span className="h-0 w-0 border-x-[5px] border-b-[10px] border-x-transparent border-b-[#881c1c]" />
                <span className="h-0 w-0 border-x-[5px] border-t-[10px] border-x-transparent border-t-neutral-400" />
              </span>
            </span>
          </Btn>
          <Btn label="Rotate right" onClick={() => ease({ bearing: map.getBearing() + 45 })}>⟳</Btn>
        </Group>
        <Group>
          <Btn label={is3d ? "Switch to flat 2D view" : "Switch to 3D view"} onClick={() => ease({ pitch: is3d ? 0 : 55 })}>
            <span className="text-xs">{is3d ? "2D" : "3D"}</span>
          </Btn>
        </Group>
        <Group>
          <Btn label="Back to campus" onClick={() => map.flyTo({ ...CAMPUS_VIEW, essential: true })}>⌂</Btn>
          <Btn
            label="Find me"
            active={wantLocate && !position}
            onClick={() => {
              if (position) map.flyTo({ center: [position.lng, position.lat], zoom: Math.max(map.getZoom(), 17.5), essential: true });
              else { setWantLocate(true); start(); }
            }}
          >
            ◎
          </Btn>
          <Btn label="How to move the map" active={help} onClick={() => setHelp((h) => !h)}>?</Btn>
        </Group>
      </div>

      {help ? (
        <div className="pointer-events-auto absolute right-14 top-[calc(env(safe-area-inset-top)+4rem)] z-[7] w-64 rounded-xl border border-neutral-200 bg-white/95 p-3 text-xs text-neutral-700 shadow-lg">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-900">Moving around</span>
            <button type="button" aria-label="Close tips" onClick={() => setHelp(false)} className="px-1 text-neutral-400 hover:text-neutral-700">✕</button>
          </div>
          <ul className="space-y-1">
            <li><b>Move:</b> drag with one finger or the mouse.</li>
            <li><b>Zoom:</b> pinch, scroll, or + and −.</li>
            <li><b>Rotate:</b> twist two fingers, or right-drag (Ctrl + drag on a trackpad), or ⟲ ⟳.</li>
            <li><b>Tilt:</b> slide two fingers up or down, or right-drag up/down, or 3D / 2D.</li>
            <li><b>Lost?</b> The needle points north; tap it to face north. ⌂ goes back to campus.</li>
          </ul>
          {status === "denied" ? <p className="mt-2 text-red-700">Location is blocked for this site, so “Find me” cannot work.</p> : null}
        </div>
      ) : null}
    </>
  );
}
