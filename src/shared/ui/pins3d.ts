import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { LatLng } from "@/shared/contracts";
import { offsetM } from "@/shared/geo";
import { addLayerToSlot, removeLayersAndSources } from "./MapProvider";

/**
 * 3D map pins: real geometry standing on the ground, not flat icons. A pin is a stack of
 * thin prisms (`fill-extrusion`) whose radius follows a teardrop profile, so it tilts,
 * turns and shrinks with the camera like any building. There is no new dependency and no
 * text, because the map has no glyphs; colour and size carry the meaning.
 *
 * `createPinLayer(map, "module")` owns one source per layer pair; ids are prefixed with the
 * module name. The pins go in `slot-markers` and their ground shadows in `slot-lines`.
 */

/** Height in metres of a pin at scale 1. */
export const PIN_HEIGHT_M = 36;
const HEAD_R = 8;
const HEAD_CENTER_Z = 27.5;
const TIP_R = 0.6;
const SLICE_M = 1.5;
const SIDES = 10;

export interface PinSpec {
  /** Feature id, echoed back in `onPick`. */
  id: string;
  at: LatLng;
  color: string;
  /** 1 is the standard pin. */
  scale?: number;
  /** Move the pin this far east / north of `at`, so two layers on one place do not overlap. */
  dxM?: number;
  dyM?: number;
  /** Extra properties copied to the picked feature. */
  props?: Record<string, string | number | boolean>;
}

/** Teardrop radius at height `z` metres, for a pin of scale 1: a cone that swells into a sphere. */
export function pinRadiusAt(z: number): number {
  const zs = HEAD_CENTER_Z - 0.7 * HEAD_R;
  const rs = Math.sqrt(HEAD_R ** 2 - (0.7 * HEAD_R) ** 2);
  if (z < zs) return TIP_R + (z / zs) * (rs - TIP_R);
  const dz = z - HEAD_CENTER_Z;
  return Math.sqrt(Math.max(HEAD_R ** 2 - dz * dz, 0));
}

/** The top of the head, where a pop-up should point. */
export function pinTopM(scale = 1): number {
  return (HEAD_CENTER_Z + HEAD_R) * scale;
}

export function disc(center: LatLng, radiusM: number, sides = SIDES): GeoJSON.Polygon {
  const coords: [number, number][] = [];
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * 2 * Math.PI;
    const p = offsetM(center, Math.cos(a) * radiusM, Math.sin(a) * radiusM);
    coords.push([p.lng, p.lat]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

/** Pins that share a spot fan out sideways so none hides another. */
function fanOut(pins: PinSpec[]): PinSpec[] {
  const groups = new Map<string, PinSpec[]>();
  for (const p of pins) {
    const key = `${p.at.lat.toFixed(5)},${p.at.lng.toFixed(5)},${p.dyM ?? 0}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const out: PinSpec[] = [];
  for (const group of groups.values()) {
    group.forEach((p, i) => {
      out.push({ ...p, dxM: (p.dxM ?? 0) + (i - (group.length - 1) / 2) * 2 * HEAD_R * 1.15 * (p.scale ?? 1) });
    });
  }
  return out;
}

/** The extrusion slices of every pin. Pure, so it is unit-tested. */
export function pinFeatures(pins: PinSpec[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  for (const pin of fanOut(pins)) {
    const s = pin.scale ?? 1;
    const base = offsetM(pin.at, pin.dxM ?? 0, pin.dyM ?? 0);
    const top = pinTopM();
    const slices = Math.ceil(top / SLICE_M);
    for (let i = 0; i < slices; i++) {
      const z0 = (i * top) / slices;
      const z1 = ((i + 1) * top) / slices;
      const r = Math.max(pinRadiusAt((z0 + z1) / 2) * s, 0.3);
      features.push({
        type: "Feature",
        properties: { id: pin.id, color: pin.color, bottom: z0 * s, top: z1 * s, ...pin.props },
        geometry: disc(base, r),
      });
    }
  }
  return { type: "FeatureCollection", features };
}

function shadowFeatures(pins: PinSpec[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: "FeatureCollection",
    features: fanOut(pins).map((pin) => ({
      type: "Feature",
      properties: { id: pin.id },
      geometry: disc(offsetM(pin.at, pin.dxM ?? 0, pin.dyM ?? 0), HEAD_R * 0.9 * (pin.scale ?? 1), 16),
    })),
  };
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export interface PinLayer {
  setPins(pins: PinSpec[]): void;
  remove(): void;
}

export function createPinLayer(
  map: MapLibreMap,
  prefix: string,
  onPick?: (properties: Record<string, unknown>) => void,
): PinLayer {
  const pinSrc = `${prefix}-pins`;
  const shadowSrc = `${prefix}-pin-shadows`;
  const pinLayer = `${prefix}-pins-3d`;
  const shadowLayer = `${prefix}-pins-shadow`;

  map.addSource(shadowSrc, { type: "geojson", data: EMPTY });
  map.addSource(pinSrc, { type: "geojson", data: EMPTY });
  addLayerToSlot(
    map,
    { id: shadowLayer, type: "fill", source: shadowSrc, paint: { "fill-color": "#0f172a", "fill-opacity": 0.22 } },
    "slot-lines",
  );
  addLayerToSlot(
    map,
    {
      id: pinLayer,
      type: "fill-extrusion",
      source: pinSrc,
      paint: {
        "fill-extrusion-color": ["get", "color"],
        "fill-extrusion-base": ["get", "bottom"],
        "fill-extrusion-height": ["get", "top"],
        "fill-extrusion-opacity": 0.96,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    "slot-markers",
  );

  const click = (e: { features?: { properties?: Record<string, unknown> | null }[] }) => {
    const props = e.features?.[0]?.properties;
    if (props) onPick?.(props);
  };
  const pointer = () => (map.getCanvas().style.cursor = "pointer");
  const unpointer = () => (map.getCanvas().style.cursor = "");
  if (onPick) {
    map.on("click", pinLayer, click);
    map.on("mouseenter", pinLayer, pointer);
    map.on("mouseleave", pinLayer, unpointer);
  }

  return {
    setPins(pins) {
      (map.getSource(pinSrc) as GeoJSONSource | undefined)?.setData(pinFeatures(pins));
      (map.getSource(shadowSrc) as GeoJSONSource | undefined)?.setData(shadowFeatures(pins));
    },
    remove() {
      if (onPick) {
        map.off("click", pinLayer, click);
        map.off("mouseenter", pinLayer, pointer);
        map.off("mouseleave", pinLayer, unpointer);
      }
      removeLayersAndSources(map, [pinLayer, shadowLayer], [pinSrc, shadowSrc]);
    },
  };
}

/**
 * How many screen pixels a vertical stretch of `metres` covers at the map's current zoom and
 * pitch, so a pop-up can sit on a pin's head instead of its foot.
 */
export function screenHeightPx(map: MapLibreMap, metres: number): number {
  const mPerPx = (78271.517 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / 2 ** map.getZoom();
  return (metres / mPerPx) * Math.sin((map.getPitch() * Math.PI) / 180);
}
