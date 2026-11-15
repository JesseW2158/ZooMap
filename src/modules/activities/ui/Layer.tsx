"use client";

import { useEffect, useRef } from "react";
import type { GeoJSONSource } from "maplibre-gl";
import { offsetM } from "@/shared/geo";
import { addLayerToSlot, createPinLayer, removeLayersAndSources, useMap, useMapEffect, useMapStore, type PinLayer } from "@/shared/ui";
import { isDevPickingNow } from "@/shared/platform";
import { GEOFENCE_M } from "../rules";
import { CATEGORY_COLORS, useActivitiesFeed, useActivitiesPoller } from "./feed";

/**
 * 3D pins for active activities, taller with more participants and coloured by category (the
 * one you are in is larger), and the 150 m ring around the activity you are in (in
 * `slot-lines`). Also owns the activities poller, since the layer is always mounted.
 */

const FENCE_SRC = "activities-geofence";
const FENCE_FILL = "activities-geofence-fill";
const FENCE_LINE = "activities-geofence-line";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function ring(center: { lat: number; lng: number }, radiusM: number, steps = 48): GeoJSON.Polygon {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const p = offsetM(center, Math.cos(angle) * radiusM, Math.sin(angle) * radiusM);
    coords.push([p.lng, p.lat]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

export function ActivitiesLayer() {
  useActivitiesPoller();
  const map = useMap();
  const { activities, me } = useActivitiesFeed();
  const { selectPlace } = useMapStore();
  const pins = useRef<PinLayer | null>(null);
  const myActivityId = me?.participation ? me.activity?.id : undefined;

  useMapEffect((m) => {
    m.addSource(FENCE_SRC, { type: "geojson", data: EMPTY });
    addLayerToSlot(
      m,
      { id: FENCE_FILL, type: "fill", source: FENCE_SRC, paint: { "fill-color": "#10b981", "fill-opacity": 0.12 } },
      "slot-lines",
    );
    addLayerToSlot(
      m,
      {
        id: FENCE_LINE,
        type: "line",
        source: FENCE_SRC,
        paint: { "line-color": "#059669", "line-width": 2, "line-dasharray": [2, 1.5] },
      },
      "slot-lines",
    );

    const pinLayer = createPinLayer(m, "activities", (props) => {
      if (isDevPickingNow()) return;
      if (typeof props.placeId === "string") selectPlace(props.placeId);
    });
    pins.current = pinLayer;
    return () => {
      pinLayer.remove();
      pins.current = null;
      removeLayersAndSources(m, [FENCE_LINE, FENCE_FILL], [FENCE_SRC]);
    };
    // selectPlace is a stable module-level action, so this runs once per map.
  }, []);

  useEffect(() => {
    pins.current?.setPins(
      (activities ?? [])
        .filter((a) => a.placeCenter)
        .map((a) => {
          const mine = a.id === myActivityId;
          return {
            id: a.id,
            at: a.placeCenter!,
            color: CATEGORY_COLORS[a.category] ?? "#525252",
            scale: (0.8 + Math.min(a.participantCount, 10) * 0.05) * (mine ? 1.2 : 1),
            props: { placeId: a.placeId },
          };
        }),
    );
  }, [map, activities, myActivityId]);

  const fenceCenter = me?.participation ? me.activity?.placeCenter : undefined;
  useEffect(() => {
    const source = map?.getSource(FENCE_SRC) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(
      fenceCenter
        ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: ring(fenceCenter, GEOFENCE_M) }] }
        : EMPTY,
    );
  }, [map, fenceCenter?.lat, fenceCenter?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
