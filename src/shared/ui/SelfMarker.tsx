"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource } from "maplibre-gl";
import { offsetM } from "@/shared/geo";
import type { LatLng } from "@/shared/contracts";
import { useUserLocation } from "@/shared/platform/location";
import { addLayerToSlot, removeLayersAndSources, useMap } from "./MapProvider";
import { createPinLayer, disc, type PinLayer } from "./pins3d";

/**
 * "You are here": a blue 3D pin standing on your position, a pulsing ring on the ground, a
 * circle for the GPS accuracy and, when the device knows which way you face, a wedge pointing
 * that way. The position never leaves the browser: it is only drawn.
 */

const BLUE = "#2563eb";
const ACCURACY_SRC = "self-accuracy";
const ACCURACY_LAYER = "self-accuracy-fill";
const WEDGE_SRC = "self-heading";
const WEDGE_LAYER = "self-heading-fill";
const PULSE_SRC = "self-pulse";
const PULSE_LAYER = "self-pulse-line";
const PULSE_PERIOD_MS = 1800;
const PULSE_FRAME_MS = 70;

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** A pie slice of `radiusM` centred on `bearing` (degrees clockwise from north). */
function wedge(center: LatLng, bearing: number, radiusM: number, halfAngle = 38): GeoJSON.Polygon {
  const ring: [number, number][] = [[center.lng, center.lat]];
  for (let i = 0; i <= 8; i++) {
    const b = ((bearing - halfAngle + (i / 8) * halfAngle * 2) * Math.PI) / 180;
    const p = offsetM(center, Math.sin(b) * radiusM, Math.cos(b) * radiusM);
    ring.push([p.lng, p.lat]);
  }
  ring.push([center.lng, center.lat]);
  return { type: "Polygon", coordinates: [ring] };
}

const polygon = (g: GeoJSON.Polygon): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: {}, geometry: g }],
});

/** Compass heading from the device, when it has one (Android reports it without a prompt). */
function useCompass(): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    const onOrient = (e: Event) => {
      const ev = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
      const h =
        typeof ev.webkitCompassHeading === "number"
          ? ev.webkitCompassHeading
          : ev.absolute && typeof ev.alpha === "number"
            ? (360 - ev.alpha) % 360
            : null;
      if (h !== null) setHeading(Math.round(h / 3) * 3);
    };
    window.addEventListener("deviceorientationabsolute", onOrient);
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("deviceorientationabsolute", onOrient);
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, []);
  return heading;
}

export function SelfMarker() {
  const map = useMap();
  const { position } = useUserLocation();
  const pins = useRef<PinLayer | null>(null);
  const compass = useCompass();
  const heading = compass ?? position?.heading ?? null;

  useEffect(() => {
    if (!map) return;
    for (const [src, layer, paint] of [
      [ACCURACY_SRC, ACCURACY_LAYER, { "fill-color": BLUE, "fill-opacity": 0.1 }],
      [WEDGE_SRC, WEDGE_LAYER, { "fill-color": BLUE, "fill-opacity": 0.35 }],
    ] as const) {
      map.addSource(src, { type: "geojson", data: EMPTY });
      addLayerToSlot(map, { id: layer, type: "fill", source: src, paint }, "slot-lines");
    }
    map.addSource(PULSE_SRC, { type: "geojson", data: EMPTY });
    addLayerToSlot(
      map,
      { id: PULSE_LAYER, type: "line", source: PULSE_SRC, paint: { "line-color": BLUE, "line-width": 3, "line-opacity": 0.6 } },
      "slot-lines",
    );
    pins.current = createPinLayer(map, "self");
    return () => {
      pins.current?.remove();
      pins.current = null;
      removeLayersAndSources(map, [ACCURACY_LAYER, WEDGE_LAYER, PULSE_LAYER], [ACCURACY_SRC, WEDGE_SRC, PULSE_SRC]);
    };
  }, [map]);

  // the pin, the accuracy circle and the heading wedge follow the fix
  useEffect(() => {
    if (!map) return;
    const set = (id: string, data: GeoJSON.FeatureCollection) =>
      (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
    if (!position) {
      pins.current?.setPins([]);
      set(ACCURACY_SRC, EMPTY);
      set(WEDGE_SRC, EMPTY);
      return;
    }
    pins.current?.setPins([{ id: "me", at: position, color: BLUE, scale: 0.75 }]);
    set(ACCURACY_SRC, polygon(disc(position, Math.min(Math.max(position.accuracyM ?? 0, 4), 120), 32)));
    set(WEDGE_SRC, heading === null ? EMPTY : polygon(wedge(position, heading, 34)));
  }, [map, position, heading]);

  // the ground ring grows and fades, about 14 frames a second
  const lat = position?.lat;
  const lng = position?.lng;
  useEffect(() => {
    if (!map) return;
    if (lat === undefined || lng === undefined) {
      (map.getSource(PULSE_SRC) as GeoJSONSource | undefined)?.setData(EMPTY);
      return;
    }
    const center = { lat, lng };
    const timer = window.setInterval(() => {
      const t = (Date.now() % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
      (map.getSource(PULSE_SRC) as GeoJSONSource | undefined)?.setData(
        polygon(disc(center, 5 + t * 26, 32)),
      );
      if (map.getLayer(PULSE_LAYER)) map.setPaintProperty(PULSE_LAYER, "line-opacity", 0.7 * (1 - t));
    }, PULSE_FRAME_MS);
    return () => window.clearInterval(timer);
  }, [map, lat, lng]);

  return null;
}
