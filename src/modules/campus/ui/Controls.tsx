"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useUserLocation } from "@/shared/platform";

/**
 * On-screen map controls with plain labels: zoom, rotate left/right, 3D/2D, a compass that
 * shows where north is (tap: face north), back to campus, find me, and a gesture help card
 * that also shows once on a first visit. Phones get only the compass, 3D/2D, find me and help.
 */

const TIP_KEY = "zoomap:map-tips-seen";
/** How long "Find me" keeps the spotlight on your position. */
const SPOTLIGHT_MS = 6000;

/** Rings that ripple out from your dot and a "You are here" tag above it. Drawn above buildings. */
function spotlightElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "pointer-events-none relative h-0 w-0";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <span class="absolute -left-10 -top-10 h-20 w-20 rounded-full border-4 border-blue-600/70 bg-blue-500/15 animate-ping"></span>
    <span class="absolute -left-6 -top-6 h-12 w-12 rounded-full border-2 border-white bg-blue-600/25 shadow-[0_0_24px_6px_rgba(37,99,235,0.55)]"></span>
    <span class="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full border-[3px] border-white bg-blue-600 shadow-md"></span>
    <span class="absolute bottom-7 left-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-lg">
      You are here
      <span class="absolute left-1/2 top-full -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-blue-600"></span>
    </span>`;
  return el;
}
export const CAMPUS_VIEW = { center: [-72.5275, 42.389] as [number, number], zoom: 16, pitch: 55, bearing: -20 };

function Btn(props: { label: string; onClick: () => void; children: ReactNode; active?: boolean; wide?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.label}
      title={props.label}
      className={`flex h-10 items-center justify-center text-[15px] font-semibold transition-colors duration-150 active:scale-90 [transition-property:background-color,color,transform] ${
        props.wide ? "w-full px-2" : "w-10"
      } ${props.active ? "bg-ink text-ivory hover:bg-yale" : "text-ink hover:bg-linen active:bg-ash/40"} ${props.className ?? ""}`}
    >
      {props.children}
    </button>
  );
}

function Group({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`animate-pop ${className} flex flex-col divide-y divide-ash/40 overflow-hidden rounded-2xl bg-white/95 shadow-lg shadow-ink/15 ring-1 ring-ink/5`}>
      {children}
    </div>
  );
}

export function MapControls({ map }: { map: MapLibreMap }) {
  const [bearing, setBearing] = useState(() => map.getBearing());
  const [pitch, setPitch] = useState(() => map.getPitch());
  const [help, setHelp] = useState(false);
  const [wantLocate, setWantLocate] = useState(false);
  const [spotlight, setSpotlight] = useState<number | null>(null);
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
    const done = setTimeout(() => { setWantLocate(false); setSpotlight(Date.now()); }, 0);
    return () => clearTimeout(done);
  }, [wantLocate, position, map]);

  // "Find me" spotlight: shown for a few seconds, following the position while it is up
  const marker = useRef<Marker | null>(null);
  const spot = useRef<[number, number] | null>(null);
  useEffect(() => {
    spot.current = position ? [position.lng, position.lat] : null;
    if (position) marker.current?.setLngLat([position.lng, position.lat]);
  }, [position]);
  useEffect(() => {
    if (spotlight === null) return;
    let cancelled = false;
    void import("maplibre-gl").then(({ Marker }) => {
      if (cancelled || !spot.current) return;
      marker.current = new Marker({ element: spotlightElement(), anchor: "center" }).setLngLat(spot.current).addTo(map);
    });
    const hide = setTimeout(() => setSpotlight(null), SPOTLIGHT_MS);
    return () => {
      cancelled = true;
      clearTimeout(hide);
      marker.current?.remove();
      marker.current = null;
    };
  }, [spotlight, map]);

  const is3d = pitch > 10;
  const ease = (opts: Parameters<MapLibreMap["easeTo"]>[0]) => map.easeTo({ duration: 450, ...opts });

  return (
    <>
      <div className="pointer-events-auto absolute right-3 top-[calc(env(safe-area-inset-top)+4.25rem)] z-[7] flex w-10 flex-col gap-2">
        {/* phones pinch to zoom and twist to rotate, so those buttons and ⌂ are desktop-only */}
        <Group className="max-md:hidden">
          <Btn label="Zoom in" onClick={() => ease({ zoom: map.getZoom() + 1 })}>+</Btn>
          <Btn label="Zoom out" onClick={() => ease({ zoom: map.getZoom() - 1 })}>−</Btn>
        </Group>
        <Group>
          <Btn label="Rotate left" className="max-md:hidden" onClick={() => ease({ bearing: map.getBearing() - 45 })}>⟲</Btn>
          <Btn label="Face north" className="max-md:border-b-0" onClick={() => ease({ bearing: 0 })}>
            <span className="relative block h-6 w-6" aria-hidden>
              {/* the needle points to north as the map turns */}
              <span className="absolute inset-0 flex flex-col items-center justify-between" style={{ transform: `rotate(${-bearing}deg)` }}>
                <span className="h-0 w-0 border-x-[5px] border-b-[10px] border-x-transparent border-b-[#881c1c]" />
                <span className="h-0 w-0 border-x-[5px] border-t-[10px] border-x-transparent border-t-neutral-400" />
              </span>
            </span>
          </Btn>
          <Btn label="Rotate right" className="max-md:hidden" onClick={() => ease({ bearing: map.getBearing() + 45 })}>⟳</Btn>
        </Group>
        <Group>
          <Btn label={is3d ? "Switch to flat 2D view" : "Switch to 3D view"} onClick={() => ease({ pitch: is3d ? 0 : 55 })}>
            <span className="text-xs">{is3d ? "2D" : "3D"}</span>
          </Btn>
        </Group>
        <Group>
          <Btn label="Back to campus" className="max-md:hidden" onClick={() => map.flyTo({ ...CAMPUS_VIEW, essential: true })}>⌂</Btn>
          <Btn
            label="Find me"
            active={wantLocate && !position}
            onClick={() => {
              if (position) {
                map.flyTo({ center: [position.lng, position.lat], zoom: Math.max(map.getZoom(), 17.5), essential: true });
                setSpotlight(Date.now());
              } else { setWantLocate(true); start(); }
            }}
          >
            ◎
          </Btn>
          <Btn label="How to move the map" active={help} onClick={() => setHelp((h) => !h)}>?</Btn>
        </Group>
      </div>

      {help ? (
        <div className="animate-pop pointer-events-auto absolute right-16 top-[calc(env(safe-area-inset-top)+4.25rem)] z-[7] w-64 origin-top-right rounded-2xl bg-white/95 p-3.5 text-xs leading-relaxed text-yale shadow-xl shadow-ink/20 ring-1 ring-ink/5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-bold text-ink">Moving around</span>
            <button type="button" aria-label="Close tips" onClick={() => setHelp(false)} className="flex h-6 w-6 items-center justify-center rounded-full text-yale/60 hover:bg-linen hover:text-ink">✕</button>
          </div>
          <ul className="space-y-1 [&_b]:text-ink">
            <li><b>Move:</b> drag with one finger or the mouse.</li>
            <li><b>Zoom:</b> pinch<span className="max-md:hidden">, scroll, or + and −</span>.</li>
            <li><b>Rotate:</b> twist two fingers<span className="max-md:hidden">, or right-drag (Ctrl + drag on a trackpad), or ⟲ ⟳</span>.</li>
            <li><b>Tilt:</b> slide two fingers up or down,<span className="max-md:hidden"> or right-drag up/down,</span> or 3D / 2D.</li>
            <li><b>Lost?</b> The needle points north; tap it to face north.<span className="max-md:hidden"> ⌂ goes back to campus.</span></li>
          </ul>
          {status === "denied" ? <p className="mt-2 text-red-700">Location is blocked for this site, so “Find me” cannot work.</p> : null}
        </div>
      ) : null}
    </>
  );
}
