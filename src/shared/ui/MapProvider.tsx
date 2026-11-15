"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type DependencyList,
  type ReactNode,
} from "react";
import type { LayerSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { isDevPickingNow, setDevLocation, useUserLocation } from "@/shared/platform/location";
import { useMapStore } from "./map-store";
import { SelfMarker } from "./SelfMarker";

export const CAMPUS_CENTER = { lat: 42.3868, lng: -72.5301 } as const;

/**
 * Four empty, invisible layers fix the draw order so independent layers never fight over it.
 * Bottom to top: ground, lines (routes, heat), buildings, markers. A layer says which slot
 * it belongs to and is inserted just below that slot's marker: `addLayerToSlot(map, spec, "lines")`.
 */
export const SLOTS = ["slot-ground", "slot-lines", "slot-buildings", "slot-markers"] as const;
export type Slot = (typeof SLOTS)[number];

const STYLE: StyleSpecification = {
  version: 8,
  // No glyphs or sprite: text labels need a glyph source, which is not provisioned.
  // Use circles, fills and HTML markers instead.
  sources: {},
  layers: [
    { id: "base", type: "background", paint: { "background-color": "#e8eee4" } },
    ...SLOTS.map((id): LayerSpecification => ({ id, type: "background", paint: { "background-opacity": 0 } })),
  ],
};

const MapContext = createContext<MapLibreMap | null>(null);

/** The map once its style has loaded, otherwise null. */
export function useMap(): MapLibreMap | null {
  return useContext(MapContext);
}

/**
 * Run `effect` once the map is ready, and again when `deps` change. Return a cleanup that
 * removes what you added.
 */
export function useMapEffect(effect: (map: MapLibreMap) => void | (() => void), deps: DependencyList): void {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    return effect(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ...deps]);
}

/** Add a layer in a draw-order slot (see SLOTS): it goes just below that slot's marker layer. Prefix `spec.id` with your module name. */
export function addLayerToSlot(map: MapLibreMap, spec: LayerSpecification, slot: Slot) {
  map.addLayer(spec, slot);
}

/** Remove layers then sources, ignoring any that are already gone. */
export function removeLayersAndSources(map: MapLibreMap, layerIds: string[], sourceIds: string[]) {
  for (const id of layerIds) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of sourceIds) if (map.getSource(id)) map.removeSource(id);
}

export function MapProvider({ children }: { children?: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let instance: MapLibreMap | undefined;
    const fail = (error: unknown) => {
      if (cancelled) return;
      console.error("[map] failed to start", error);
      setFailure(error instanceof Error ? error.message : String(error));
    };

    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      // Turbopack rewrites import.meta.url, so MapLibre cannot find its own worker.
      // `npm run dev` and `build` copy it to public/ (scripts/copy-maplibre-worker.mjs).
      maplibregl.setWorkerUrl(`${window.location.origin}/maplibre/maplibre-gl-worker.mjs`);
      instance = new maplibregl.Map({
        container: container.current,
        style: STYLE,
        center: [CAMPUS_CENTER.lng, CAMPUS_CENTER.lat],
        zoom: 16,
        pitch: 55,
        bearing: -20,
        maxPitch: 80,
        attributionControl: { compact: true, customAttribution: "© OpenStreetMap contributors" },
      });
      // on-screen controls are the campus module's MapControls (labelled, with gesture help)
      let started = false;
      instance.on("load", () => {
        started = true;
        if (!cancelled && instance) setMap(instance);
        // OpenStreetMap's attribution guidelines allow the credit to collapse into the (i)
        // button as long as it is shown when the map first loads; MapLibre otherwise keeps it
        // open until the first drag.
        window.setTimeout(() => {
          container.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        }, 5000);
      });
      // Errors before `load` (worker, WebGL) mean the map never starts; later ones are a
      // layer's source problem and are only logged by MapLibre.
      instance.on("error", (e) => {
        if (!started) fail(e.error);
      });
    })().catch(fail);

    return () => {
      cancelled = true;
      setMap(null);
      instance?.remove();
    };
  }, []);

  return (
    <MapContext.Provider value={map}>
      {/* MapLibre adds `.maplibregl-map { position: relative }` to its container, and that
          unlayered rule beats Tailwind's layered `.absolute`, collapsing the map to 0px tall.
          So the positioning lives on a wrapper and the map's own div only fills it. */}
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" />
      </div>
      {failure ? (
        <div role="alert" className="absolute inset-x-3 top-24 z-[5] rounded-xl bg-red-50 p-3 text-sm text-red-800 shadow">
          The map could not start: {failure}. Reload the page; if it keeps failing, try another browser.
        </div>
      ) : null}
      {map ? <MapBehaviours map={map} /> : null}
      {children}
    </MapContext.Provider>
  );
}

/** Camera requests, the user's own marker (SelfMarker) and the dev location picker. */
function MapBehaviours({ map }: { map: MapLibreMap }) {
  const { flyRequest } = useMapStore();
  const { isDevPicking } = useUserLocation();

  // fly requests from panels
  useEffect(() => {
    if (!flyRequest) return;
    map.flyTo({
      center: [flyRequest.pos.lng, flyRequest.pos.lat],
      zoom: flyRequest.zoom ?? Math.max(map.getZoom(), 17),
      pitch: flyRequest.pitch,
      bearing: flyRequest.bearing,
      essential: true,
    });
  }, [map, flyRequest]);

  // dev location picker: the next click sets the user's location
  useEffect(() => {
    if (!isDevPicking) return;
    const onClick = (e: { lngLat: { lat: number; lng: number } }) => {
      if (isDevPickingNow()) setDevLocation({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    };
    map.getCanvas().style.cursor = "crosshair";
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [map, isDevPicking]);

  return <SelfMarker />;
}
