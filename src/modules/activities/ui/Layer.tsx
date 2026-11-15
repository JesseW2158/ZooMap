"use client";

import { useEffect } from "react";
import type { ExpressionSpecification, GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import { offsetM } from "@/shared/geo";
import { addLayerToSlot, PIN_MIN_ZOOM, removeLayersAndSources, useMap, useMapEffect, useMapStore } from "@/shared/ui";
import { isDevPickingNow } from "@/shared/platform";
import { GEOFENCE_M } from "../rules";
import { CATEGORY_COLORS, useActivitiesFeed, useActivitiesPoller } from "./feed";

/**
 * Markers for active activities (in `slot-markers`), sized by participant count and coloured
 * by category, and the 150 m ring around the activity you are in (in `slot-lines`). Also
 * owns the activities poller, since the layer is always mounted.
 */

const MARKER_SRC = "activities-markers";
const HALO_LAYER = "activities-markers-halo";
const DOT_LAYER = "activities-markers-dot";
const FENCE_SRC = "activities-geofence";
const FENCE_FILL = "activities-geofence-fill";
const FENCE_LINE = "activities-geofence-line";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const colorByCategory = [
  "match",
  ["get", "category"],
  ...Object.entries(CATEGORY_COLORS).flat(),
  "#525252",
] as unknown as ExpressionSpecification;

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

    m.addSource(MARKER_SRC, { type: "geojson", data: EMPTY });
    addLayerToSlot(
      m,
      {
        id: HALO_LAYER,
        type: "circle",
        minzoom: PIN_MIN_ZOOM,
        source: MARKER_SRC,
        filter: ["==", ["get", "mine"], true],
        paint: {
          "circle-radius": ["+", 10, ["*", 2.5, ["min", ["get", "count"], 10]]],
          "circle-color": "#10b981",
          "circle-opacity": 0.3,
          "circle-pitch-alignment": "map",
        },
      },
      "slot-markers",
    );
    addLayerToSlot(
      m,
      {
        id: DOT_LAYER,
        type: "circle",
        minzoom: PIN_MIN_ZOOM,
        source: MARKER_SRC,
        paint: {
          "circle-radius": ["+", 6, ["*", 1.5, ["min", ["get", "count"], 10]]],
          "circle-color": colorByCategory,
          "circle-stroke-width": ["case", ["==", ["get", "mine"], true], 4, 2],
          "circle-stroke-color": ["case", ["==", ["get", "mine"], true], "#059669", "#ffffff"],
          "circle-pitch-alignment": "map",
        },
      },
      "slot-markers",
    );

    const onClick = (e: MapLayerMouseEvent) => {
      if (isDevPickingNow()) return;
      const placeId = e.features?.[0]?.properties?.placeId;
      if (typeof placeId === "string") selectPlace(placeId);
    };
    const pointer = () => (m.getCanvas().style.cursor = "pointer");
    const unpointer = () => (m.getCanvas().style.cursor = "");
    m.on("click", DOT_LAYER, onClick);
    m.on("mouseenter", DOT_LAYER, pointer);
    m.on("mouseleave", DOT_LAYER, unpointer);
    return () => {
      m.off("click", DOT_LAYER, onClick);
      m.off("mouseenter", DOT_LAYER, pointer);
      m.off("mouseleave", DOT_LAYER, unpointer);
      removeLayersAndSources(m, [DOT_LAYER, HALO_LAYER, FENCE_LINE, FENCE_FILL], [MARKER_SRC, FENCE_SRC]);
    };
    // selectPlace is a stable module-level action, so this runs once per map.
  }, []);

  useEffect(() => {
    const source = map?.getSource(MARKER_SRC) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: "FeatureCollection",
      features: (activities ?? [])
        .filter((a) => a.placeCenter)
        .map((a) => ({
          type: "Feature",
          properties: {
            id: a.id,
            placeId: a.placeId,
            category: a.category,
            count: a.participantCount,
            mine: a.id === myActivityId,
          },
          geometry: { type: "Point", coordinates: [a.placeCenter!.lng, a.placeCenter!.lat] },
        })),
    });
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
