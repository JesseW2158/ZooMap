"use client";

import { useEffect, useRef } from "react";
import type { ExpressionSpecification, Map as MapLibreMap, Popup } from "maplibre-gl";
import type { BuildingCollection, GroundCollection } from "@/shared/contracts";
import { isDevPickingNow } from "@/shared/platform";
import { addLayerToSlot, removeLayersAndSources, useApi, useMap, useMapEffect, useMapStore } from "@/shared/ui";

/**
 * The 3D campus: ground (lawns, water, parking, roads, paths) and buildings extruded to
 * their OpenStreetMap height, drawn on the plain background with no outside tiles.
 * Tapping a building selects its place. Layer ids are prefixed `campus-`.
 * Colours follow the umass-3d-map palette: warm stone buildings that deepen with height,
 * UMass maroon for the selection.
 */

const GROUND_SRC = "campus-ground";
const GROUND_FILL = "campus-ground-fill";
const ROAD_CASING = "campus-road-casing";
const ROAD_LINES = "campus-road-lines";
const PATH_LINES = "campus-path-lines";
const BUILDING_SRC = "campus-buildings";
const BUILDING_LAYER = "campus-buildings-3d";

const SELECTED_COLOR = "#881c1c";
const BUILDING_COLOR: ExpressionSpecification = [
  "interpolate", ["linear"], ["get", "heightM"],
  4, "#e4dfd7",
  20, "#d4c9bd",
  60, "#b9a79a",
];

/** South-west and north-east corners the camera may not leave. */
const MAX_BOUNDS: [[number, number], [number, number]] = [[-72.548, 42.370], [-72.506, 42.406]];
const START = { center: [-72.5275, 42.389] as [number, number], zoom: 16, pitch: 55, bearing: -20 };

const lineWidth = (atZ15: number, atZ19: number): ExpressionSpecification =>
  ["interpolate", ["exponential", 2], ["zoom"], 15, atZ15, 19, atZ19];

function setupCamera(map: MapLibreMap) {
  map.setMaxBounds(MAX_BOUNDS);
  map.setMinZoom(14.5);
  map.setMaxZoom(19.5);
  map.setMaxPitch(70);
  map.jumpTo(START);
}

export function CampusLayer() {
  const ground = useApi<GroundCollection>("/api/campus/ground");
  const buildings = useApi<BuildingCollection>("/api/campus/buildings");
  const { selectedPlaceId, selectPlace } = useMapStore();
  const map = useMap();
  const cameraSet = useRef(false);

  // camera limits, once per map
  useEffect(() => {
    if (!map || cameraSet.current) return;
    cameraSet.current = true;
    setupCamera(map);
  }, [map]);

  useMapEffect(
    (map) => {
      if (!ground.data) return;
      map.addSource(GROUND_SRC, { type: "geojson", data: ground.data as GeoJSON.FeatureCollection, tolerance: 0.2 });
      addLayerToSlot(
        map,
        {
          id: GROUND_FILL,
          type: "fill",
          source: GROUND_SRC,
          filter: ["match", ["get", "kind"], ["grass", "water", "parking"], true, false],
          paint: {
            "fill-color": ["match", ["get", "kind"], "grass", "#c6d6b3", "water", "#9ec3d6", "#d5d3cc"],
            "fill-antialias": true,
          },
        },
        "slot-ground",
      );
      addLayerToSlot(
        map,
        {
          id: ROAD_CASING,
          type: "line",
          source: GROUND_SRC,
          filter: ["==", ["get", "kind"], "road"],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#cfcac0", "line-width": lineWidth(4, 26) },
        },
        "slot-ground",
      );
      addLayerToSlot(
        map,
        {
          id: ROAD_LINES,
          type: "line",
          source: GROUND_SRC,
          filter: ["==", ["get", "kind"], "road"],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#ffffff", "line-width": lineWidth(2.5, 22) },
        },
        "slot-ground",
      );
      addLayerToSlot(
        map,
        {
          id: PATH_LINES,
          type: "line",
          source: GROUND_SRC,
          filter: ["==", ["get", "kind"], "path"],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#f6f4ef", "line-width": lineWidth(1, 7) },
        },
        "slot-ground",
      );
      return () => removeLayersAndSources(map, [PATH_LINES, ROAD_LINES, ROAD_CASING, GROUND_FILL], [GROUND_SRC]);
    },
    [ground.data],
  );

  useMapEffect(
    (map) => {
      if (!buildings.data) return;
      map.addSource(BUILDING_SRC, { type: "geojson", data: buildings.data as GeoJSON.FeatureCollection, tolerance: 0.2 });
      addLayerToSlot(
        map,
        {
          id: BUILDING_LAYER,
          type: "fill-extrusion",
          source: BUILDING_SRC,
          paint: {
            "fill-extrusion-height": ["get", "heightM"],
            "fill-extrusion-base": 0,
            "fill-extrusion-color": BUILDING_COLOR,
            "fill-extrusion-opacity": 0.96,
            "fill-extrusion-vertical-gradient": true,
          },
        },
        "slot-buildings",
      );

      const onClick = (e: { features?: { properties?: Record<string, unknown> }[] }) => {
        if (isDevPickingNow()) return;
        const placeId = e.features?.[0]?.properties?.placeId;
        if (typeof placeId === "string") selectPlace(placeId);
      };
      map.on("click", BUILDING_LAYER, onClick);
      return () => {
        map.off("click", BUILDING_LAYER, onClick);
        removeLayersAndSources(map, [BUILDING_LAYER], [BUILDING_SRC]);
      };
    },
    [buildings.data, selectPlace],
  );

  // hover name on devices with a pointer (no glyphs, so an HTML popup instead of a map label)
  useMapEffect(
    (map) => {
      if (!buildings.data || !window.matchMedia("(hover: hover)").matches) return;
      let popup: Popup | null = null;
      let cancelled = false;
      void import("maplibre-gl").then(({ Popup }) => {
        if (!cancelled) popup = new Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "campus-hover" });
      });
      const onMove = (e: { lngLat: { lng: number; lat: number }; features?: { properties?: Record<string, unknown> }[] }) => {
        const name = e.features?.[0]?.properties?.name;
        map.getCanvas().style.cursor = typeof name === "string" ? "pointer" : "";
        if (!popup) return;
        if (typeof name === "string") popup.setLngLat(e.lngLat).setText(name).addTo(map);
        else popup.remove();
      };
      const onLeave = () => {
        map.getCanvas().style.cursor = "";
        popup?.remove();
      };
      map.on("mousemove", BUILDING_LAYER, onMove);
      map.on("mouseleave", BUILDING_LAYER, onLeave);
      return () => {
        cancelled = true;
        map.off("mousemove", BUILDING_LAYER, onMove);
        map.off("mouseleave", BUILDING_LAYER, onLeave);
        popup?.remove();
      };
    },
    [buildings.data],
  );

  // highlight the selected building (runs after the effect above has added the layer)
  useMapEffect(
    (map) => {
      if (!map.getLayer(BUILDING_LAYER)) return;
      map.setPaintProperty(BUILDING_LAYER, "fill-extrusion-color", [
        "case",
        ["==", ["get", "placeId"], selectedPlaceId ?? ""],
        SELECTED_COLOR,
        BUILDING_COLOR,
      ]);
    },
    [selectedPlaceId, buildings.data],
  );

  return (
    <div className="pointer-events-auto absolute right-2 top-[calc(env(safe-area-inset-top)+7.5rem)] z-[5] rounded bg-white/80 px-1.5 py-0.5 text-[10px] text-neutral-600">
      ©{" "}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
        OpenStreetMap
      </a>{" "}
      contributors
    </div>
  );
}
