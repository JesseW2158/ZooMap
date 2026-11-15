"use client";

import { useEffect, useRef, useState } from "react";
import type { ExpressionSpecification, Map as MapLibreMap, Popup } from "maplibre-gl";
import type { BuildingCollection, GroundCollection } from "@/shared/contracts";
import { isDevPickingNow } from "@/shared/platform";
import { addLayerToSlot, removeLayersAndSources, useApi, useMap, useMapEffect, useMapStore } from "@/shared/ui";
import { CAMPUS_VIEW, MapControls } from "./Controls";
import {
  BUILDING_COLOR,
  COLORS,
  HAZE_COLOR,
  LIGHT,
  MAX_BOUNDS,
  SKY,
  hazeFrames,
  lineWidth,
  paintBuildings,
  treeCanopies,
} from "./look";

/**
 * The 3D campus: ground (lawns, woods, pitches, water, parking, roads, paths), trees, and
 * buildings extruded to their OpenStreetMap height and coloured by material (see `look.ts`),
 * under a warm light and a sky with haze. Drawn on the plain background with no outside
 * tiles. Tapping a building selects its place. Layer ids are prefixed `campus-`.
 *
 * Decorative extras (trees, woods, pitches, tracks) come from `public/campus/decor.geojson`,
 * built by `scripts/build-campus-decor.ts`; the map works without it.
 *
 * Around campus, the town and countryside (`public/campus/surroundings.geojson`, built by
 * `scripts/build-campus-surroundings.ts`) are drawn quieter than campus, and the whole map
 * fades into haze past the camera bounds, so it has no hard edge.
 */

const GROUND_SRC = "campus-ground";
const GROUND_FILL = "campus-ground-fill";
const GROUND_EDGE = "campus-ground-edge";
const WATER_SHIMMER = "campus-water-shimmer";
const ROAD_CASING = "campus-road-casing";
const ROAD_LINES = "campus-road-lines";
const PATH_CASING = "campus-path-casing";
const PATH_LINES = "campus-path-lines";
const DECOR_SRC = "campus-decor";
const DECOR_FILL = "campus-decor-fill";
const PITCH_LINES = "campus-pitch-lines";
const SHADOW_SRC = "campus-shadow";
const BUILDING_SHADOW = "campus-building-shadow";
const TREE_SHADOW = "campus-tree-shadow";
const TREE_SRC = "campus-trees";
const TREE_LAYER = "campus-trees-3d";
const BUILDING_SRC = "campus-buildings";
const BUILDING_LAYER = "campus-buildings-3d";
const SURR_SRC = "campus-surroundings";
const SURR_AREA = "campus-surroundings-area";
const SURR_ROAD_CASING = "campus-surroundings-road-casing";
const SURR_ROAD = "campus-surroundings-road";
const SURR_TREE_SRC = "campus-surroundings-trees";
const SURR_TREES = "campus-surroundings-trees-3d";
const SURR_BUILDINGS = "campus-surroundings-buildings-3d";
const HAZE_SRC = "campus-haze";
const HAZE_LAYER = "campus-haze";

const DECOR_URL = "/campus/decor.geojson";
const SURROUNDINGS_URL = "/campus/surroundings.geojson";

function setupCamera(map: MapLibreMap) {
  map.setMaxBounds(MAX_BOUNDS);
  map.setMinZoom(14.5);
  map.setMaxZoom(19.5);
  map.setMaxPitch(70);
  map.jumpTo(CAMPUS_VIEW);
  // the base layer belongs to the shared style; the campus decides what the ground looks like
  map.setPaintProperty("base", "background-color", COLORS.base);
  map.setLight({ ...LIGHT, position: [...LIGHT.position] });
  map.setSky({ ...SKY });
}

/** A static decoration file; null until loaded, and null for good if it is missing. */
function useStaticGeojson(url: string): GeoJSON.FeatureCollection | null {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<GeoJSON.FeatureCollection>) : null))
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {}); // decoration only: the map is complete without it
    return () => {
      cancelled = true;
    };
  }, [url]);
  return data;
}

/** The layer just above the ground slot, so something placed before it covers all ground. */
function firstLayerAbove(map: MapLibreMap, slot: string): string | undefined {
  const layers = map.getStyle().layers;
  const i = layers.findIndex((l) => l.id === slot);
  return i >= 0 ? layers[i + 1]?.id : undefined;
}

export function CampusLayer() {
  const ground = useApi<GroundCollection>("/api/campus/ground");
  const buildings = useApi<BuildingCollection>("/api/campus/buildings");
  const decor = useStaticGeojson(DECOR_URL);
  const surroundings = useStaticGeojson(SURROUNDINGS_URL);
  const { selectedPlaceId, selectPlace } = useMapStore();
  const map = useMap();
  const cameraSet = useRef(false);

  // camera limits, light and sky, once per map
  useEffect(() => {
    if (!map || cameraSet.current) return;
    cameraSet.current = true;
    setupCamera(map);
  }, [map]);

  // the town and countryside around campus: flat land use and roads under the campus
  // ground (whichever loads first), houses and woodland trees already tinted towards the haze
  useMapEffect(
    (map) => {
      if (!surroundings) return;
      map.addSource(SURR_SRC, { type: "geojson", data: surroundings, tolerance: 0.4 });
      map.addSource(SURR_TREE_SRC, { type: "geojson", data: treeCanopies(surroundings), tolerance: 0 });
      const below = map.getLayer(GROUND_FILL) ? GROUND_FILL : "slot-ground";
      // zoom must be the outer input, so the class is matched at each zoom stop
      const roadWidth = (major: [number, number], minor: [number, number], service: [number, number]): ExpressionSpecification => {
        const at = (i: 0 | 1): ExpressionSpecification => ["match", ["get", "class"], "major", major[i], "service", service[i], minor[i]];
        return ["interpolate", ["exponential", 2], ["zoom"], 15, at(0), 19, at(1)];
      };
      map.addLayer(
        { id: SURR_AREA, type: "fill", source: SURR_SRC, filter: ["==", ["get", "kind"], "area"], paint: { "fill-color": ["get", "color"] } },
        below,
      );
      map.addLayer(
        {
          id: SURR_ROAD_CASING,
          type: "line",
          source: SURR_SRC,
          filter: ["==", ["get", "kind"], "road"],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": COLORS.roadCasing, "line-width": roadWidth([4.5, 28], [2.6, 17], [1.6, 10]) },
        },
        below,
      );
      map.addLayer(
        {
          id: SURR_ROAD,
          type: "line",
          source: SURR_SRC,
          filter: ["==", ["get", "kind"], "road"],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": COLORS.road, "line-width": roadWidth([3, 23], [1.7, 13], [1, 7]) },
        },
        below,
      );
      addLayerToSlot(
        map,
        {
          id: SURR_BUILDINGS,
          type: "fill-extrusion",
          source: SURR_SRC,
          filter: ["==", ["get", "kind"], "building"],
          paint: {
            "fill-extrusion-height": ["get", "h"],
            "fill-extrusion-base": 0,
            "fill-extrusion-color": ["get", "color"],
            "fill-extrusion-vertical-gradient": true,
          },
        },
        "slot-buildings",
      );
      addLayerToSlot(
        map,
        {
          id: SURR_TREES,
          type: "fill-extrusion",
          source: SURR_TREE_SRC,
          minzoom: 14.8,
          paint: {
            "fill-extrusion-base": ["get", "base"],
            "fill-extrusion-height": ["get", "top"],
            "fill-extrusion-color": ["get", "color"],
            "fill-extrusion-opacity": 0.95,
            "fill-extrusion-vertical-gradient": true,
          },
        },
        "slot-buildings",
      );
      return () =>
        removeLayersAndSources(map, [SURR_TREES, SURR_BUILDINGS, SURR_ROAD, SURR_ROAD_CASING, SURR_AREA], [SURR_TREE_SRC, SURR_SRC]);
    },
    [surroundings],
  );

  // haze past the camera bounds: stacked frames over all the ground, so the map fades out
  // instead of stopping at the edge of the data
  useMapEffect((map) => {
    map.addSource(HAZE_SRC, { type: "geojson", data: hazeFrames(), tolerance: 0.5 });
    map.addLayer(
      {
        id: HAZE_LAYER,
        type: "fill",
        source: HAZE_SRC,
        paint: { "fill-color": HAZE_COLOR, "fill-opacity": ["get", "opacity"], "fill-antialias": false },
      },
      firstLayerAbove(map, "slot-ground"),
    );
    return () => removeLayersAndSources(map, [HAZE_LAYER], [HAZE_SRC]);
  }, []);

  // ground: lawns, woods, pitches, water, parking, then roads and paths on top
  useMapEffect(
    (map) => {
      if (!ground.data) return;
      const layers: string[] = [];
      const sources: string[] = [];
      const add = (spec: Parameters<typeof addLayerToSlot>[1]) => {
        addLayerToSlot(map, spec, "slot-ground");
        layers.push(spec.id);
      };

      map.addSource(GROUND_SRC, { type: "geojson", data: ground.data as GeoJSON.FeatureCollection, tolerance: 0.2 });
      sources.push(GROUND_SRC);
      add({
        id: GROUND_FILL,
        type: "fill",
        source: GROUND_SRC,
        filter: ["match", ["get", "kind"], ["grass", "water", "parking"], true, false],
        paint: {
          "fill-color": ["match", ["get", "kind"], "grass", COLORS.grass, "water", COLORS.water, COLORS.parking],
          "fill-antialias": true,
        },
      });
      add({
        id: GROUND_EDGE,
        type: "line",
        source: GROUND_SRC,
        filter: ["match", ["get", "kind"], ["grass", "water", "parking"], true, false],
        paint: {
          "line-color": ["match", ["get", "kind"], "grass", COLORS.grassEdge, "water", COLORS.waterEdge, COLORS.parkingEdge],
          // zoom must be the outer input of an expression, so the kind is matched at each stop
          "line-width": [
            "interpolate",
            ["exponential", 2],
            ["zoom"],
            15,
            ["match", ["get", "kind"], "water", 1.5, 0.6],
            19,
            ["match", ["get", "kind"], "water", 6, 2],
          ],
        },
      });

      if (decor) {
        map.addSource(DECOR_SRC, { type: "geojson", data: decor, tolerance: 0.3 });
        sources.push(DECOR_SRC);
        add({
          id: DECOR_FILL,
          type: "fill",
          source: DECOR_SRC,
          filter: ["match", ["get", "kind"], ["wood", "pitch", "track"], true, false],
          paint: { "fill-color": ["match", ["get", "kind"], "wood", COLORS.wood, "pitch", COLORS.pitch, COLORS.track] },
        });
        add({
          id: PITCH_LINES,
          type: "line",
          source: DECOR_SRC,
          filter: ["match", ["get", "kind"], ["pitch", "track"], true, false],
          paint: { "line-color": COLORS.pitchLines, "line-width": lineWidth(0.6, 3), "line-opacity": 0.85 },
        });
      }

      // a moving glint along the shore; static when the viewer prefers reduced motion
      add({
        id: WATER_SHIMMER,
        type: "line",
        source: GROUND_SRC,
        filter: ["==", ["get", "kind"], "water"],
        paint: { "line-color": "#ffffff", "line-width": lineWidth(1, 4), "line-opacity": 0.7, "line-dasharray": [0, 4, 3] },
      });

      add({
        id: ROAD_CASING,
        type: "line",
        source: GROUND_SRC,
        filter: ["==", ["get", "kind"], "road"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": COLORS.roadCasing, "line-width": lineWidth(4.5, 28) },
      });
      add({
        id: ROAD_LINES,
        type: "line",
        source: GROUND_SRC,
        filter: ["==", ["get", "kind"], "road"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": COLORS.road, "line-width": lineWidth(3, 23) },
      });
      add({
        id: PATH_CASING,
        type: "line",
        source: GROUND_SRC,
        filter: ["==", ["get", "kind"], "path"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": COLORS.pathCasing, "line-width": lineWidth(2.4, 11) },
      });
      add({
        id: PATH_LINES,
        type: "line",
        source: GROUND_SRC,
        filter: ["==", ["get", "kind"], "path"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": COLORS.path, "line-width": lineWidth(1.5, 8) },
      });

      let frame = 0;
      let timer: ReturnType<typeof setInterval> | undefined;
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        // the dash pattern steps along the shoreline, which reads as light moving on water
        const steps: number[][] = [
          [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
          [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
        ];
        timer = setInterval(() => {
          frame = (frame + 1) % steps.length;
          if (map.getLayer(WATER_SHIMMER)) map.setPaintProperty(WATER_SHIMMER, "line-dasharray", steps[frame]);
        }, 140);
      }

      return () => {
        if (timer) clearInterval(timer);
        removeLayersAndSources(map, layers.reverse(), sources);
      };
    },
    [ground.data, decor],
  );

  // soft shadows on the ground, cast to the north-east, under buildings and trees; added
  // after the ground layers so they sit on top of lawns and paths
  useMapEffect(
    (map) => {
      if (!ground.data || !buildings.data) return;
      map.addSource(SHADOW_SRC, { type: "geojson", data: buildings.data as GeoJSON.FeatureCollection, tolerance: 0.3 });
      addLayerToSlot(
        map,
        {
          id: BUILDING_SHADOW,
          type: "fill",
          source: SHADOW_SRC,
          paint: {
            "fill-color": COLORS.shadow,
            "fill-opacity": 0.2,
            "fill-translate": ["interpolate", ["exponential", 2], ["zoom"], 15, ["literal", [1.5, -1.5]], 19, ["literal", [22, -22]]],
            "fill-translate-anchor": "map",
            "fill-antialias": false,
          },
        },
        "slot-ground",
      );
      const layers = [BUILDING_SHADOW];
      if (decor) {
        addLayerToSlot(
          map,
          {
            id: TREE_SHADOW,
            type: "circle",
            source: DECOR_SRC,
            filter: ["==", ["get", "kind"], "tree"],
            paint: {
              "circle-color": COLORS.shadow,
              "circle-opacity": 0.22,
              "circle-blur": 0.6,
              "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 15, 1.5, 19, 22],
              "circle-translate": ["interpolate", ["exponential", 2], ["zoom"], 15, ["literal", [0.6, -0.6]], 19, ["literal", [9, -9]]],
              "circle-translate-anchor": "map",
              "circle-pitch-alignment": "map",
            },
          },
          "slot-ground",
        );
        layers.push(TREE_SHADOW);
      }
      return () => removeLayersAndSources(map, layers, [SHADOW_SRC]);
    },
    [ground.data, buildings.data, decor],
  );

  // trees: small extruded canopies on short trunks of air
  useMapEffect(
    (map) => {
      if (!decor) return;
      map.addSource(TREE_SRC, { type: "geojson", data: treeCanopies(decor), tolerance: 0 });
      addLayerToSlot(
        map,
        {
          id: TREE_LAYER,
          type: "fill-extrusion",
          source: TREE_SRC,
          minzoom: 14.8,
          paint: {
            "fill-extrusion-base": ["get", "base"],
            "fill-extrusion-height": ["get", "top"],
            "fill-extrusion-color": ["match", ["get", "tone"], 0, COLORS.trees[0], 1, COLORS.trees[1], COLORS.trees[2]],
            "fill-extrusion-opacity": 0.95,
            "fill-extrusion-vertical-gradient": true,
          },
        },
        "slot-buildings",
      );
      return () => removeLayersAndSources(map, [TREE_LAYER], [TREE_SRC]);
    },
    [decor],
  );

  useMapEffect(
    (map) => {
      if (!buildings.data) return;
      map.addSource(BUILDING_SRC, {
        type: "geojson",
        data: paintBuildings(buildings.data as GeoJSON.FeatureCollection),
        tolerance: 0.2,
      });
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
            "fill-extrusion-opacity": 1,
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
        COLORS.selected,
        BUILDING_COLOR,
      ]);
    },
    [selectedPlaceId, buildings.data],
  );

  // the OpenStreetMap credit is in MapLibre's attribution control (see MapProvider)
  return map ? <MapControls map={map} /> : null;
}
