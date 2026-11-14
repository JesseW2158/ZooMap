"use client";

import type { BuildingCollection, GroundCollection } from "@/shared/contracts";
import { isDevPickingNow } from "@/shared/platform";
import { addLayerToSlot, removeLayersAndSources, useApi, useMapEffect, useMapStore } from "@/shared/ui";

/**
 * FOUNDATION STUB of the campus layer (owner: 01-campus-map). Draws the ground and the
 * buildings as 3D extrusions from the two campus endpoints; a tap selects the place.
 * Layer ids are prefixed `campus-`.
 */

const GROUND_SRC = "campus-ground";
const GROUND_FILL = "campus-ground-fill";
const GROUND_LINES = "campus-ground-lines";
const BUILDING_SRC = "campus-buildings";
const BUILDING_LAYER = "campus-buildings-3d";

const BUILDING_COLOR = "#d6d3d1";
const SELECTED_COLOR = "#f59e0b";

export function CampusLayer() {
  const ground = useApi<GroundCollection>("/api/campus/ground");
  const buildings = useApi<BuildingCollection>("/api/campus/buildings");
  const { selectedPlaceId, selectPlace } = useMapStore();

  useMapEffect(
    (map) => {
      if (!ground.data) return;
      map.addSource(GROUND_SRC, { type: "geojson", data: ground.data as GeoJSON.FeatureCollection });
      addLayerToSlot(
        map,
        {
          id: GROUND_FILL,
          type: "fill",
          source: GROUND_SRC,
          filter: ["match", ["get", "kind"], ["grass", "water", "parking"], true, false],
          paint: {
            "fill-color": ["match", ["get", "kind"], "grass", "#cfe3c3", "water", "#b9d7ea", "#dcdcd6"],
          },
        },
        "slot-ground",
      );
      addLayerToSlot(
        map,
        {
          id: GROUND_LINES,
          type: "line",
          source: GROUND_SRC,
          filter: ["match", ["get", "kind"], ["path", "road"], true, false],
          paint: {
            "line-color": ["match", ["get", "kind"], "road", "#ffffff", "#f1ead7"],
            "line-width": ["match", ["get", "kind"], "road", 6, 3],
          },
        },
        "slot-ground",
      );
      return () => removeLayersAndSources(map, [GROUND_FILL, GROUND_LINES], [GROUND_SRC]);
    },
    [ground.data],
  );

  useMapEffect(
    (map) => {
      if (!buildings.data) return;
      map.addSource(BUILDING_SRC, { type: "geojson", data: buildings.data as GeoJSON.FeatureCollection });
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
            "fill-extrusion-opacity": 0.95,
          },
        },
        "slot-buildings",
      );

      const onClick = (e: { features?: { properties?: Record<string, unknown> }[] }) => {
        if (isDevPickingNow()) return;
        const placeId = e.features?.[0]?.properties?.placeId;
        if (typeof placeId === "string") selectPlace(placeId);
      };
      const pointer = () => (map.getCanvas().style.cursor = "pointer");
      const reset = () => (map.getCanvas().style.cursor = "");
      map.on("click", BUILDING_LAYER, onClick);
      map.on("mouseenter", BUILDING_LAYER, pointer);
      map.on("mouseleave", BUILDING_LAYER, reset);
      return () => {
        map.off("click", BUILDING_LAYER, onClick);
        map.off("mouseenter", BUILDING_LAYER, pointer);
        map.off("mouseleave", BUILDING_LAYER, reset);
        removeLayersAndSources(map, [BUILDING_LAYER], [BUILDING_SRC]);
      };
    },
    [buildings.data, selectPlace],
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

  return null;
}
