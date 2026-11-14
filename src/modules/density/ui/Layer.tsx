"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl";
import type { BuildingCollection, DensityResponse } from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { haversineM } from "@/shared/geo";
import { isNativeShell, useUserLocation } from "@/shared/platform";
import { addLayerToSlot, removeLayersAndSources, useApi, useMapEffect, useMapStore, usePolling } from "@/shared/ui";
import { useStore } from "@/shared/ui/store";
import { densityAt, pointWeight, rampColor, rampExpression, type RampId } from "./field";
import { featureCenter, growBuildings } from "./geometry";
import { Legend } from "./Legend";
import { modeById } from "./modes";
import { densityStore, loadSharing, loadSnapshot, PING_MS, POLL_MS, restoreHeatMode } from "./state";

/**
 * The crowd heatmap, in one of four modes (see modes.ts). In the two full modes the whole campus
 * is one field (grass, parking and gaps are hidden; roads, paths and the pond stay); in the
 * grass mode the heat is laid over the normal map; with heat off the normal map is untouched.
 * Wherever heat shows, every building is painted the colour of the field under it.
 *
 * Polls the snapshot every ten seconds (paused while the tab is hidden) and, when the user
 * has chosen to share, pings the server with their position. In the Android shell the native
 * pinger does the pinging instead. Layer ids are prefixed `density-`.
 */

const HEAT_SRC = "density-points";
const HEAT_LAYER = "density-heat";
const TINT_SRC = "density-tint";
const TINT_LAYER = "density-tint-3d";
/** The coloured buildings are full-height copies of the campus ones, this much bigger so their walls never share a plane with them. */
const TINT_GROW_M = 0.3;

/** The campus layer that draws grass, water and parking. While the heatmap is on it shows only the water. */
const GROUND_FILL = "campus-ground-fill";
/** The heat sits just under the roads when it is laid over the grass. */
const ROAD_CASING = "campus-road-casing";
const WATER_ONLY: FilterSpecification = ["==", ["get", "kind"], "water"];

/**
 * Heat kernel radius, fixed at 130 m on the ground: pixels = metres / (metres per pixel).
 * At 42.39 N one pixel is 3.53 m at zoom 14 and halves with each zoom, so 130 m is 36.9 px at
 * zoom 14 and 32 times that at zoom 19. Must match FIELD_RADIUS_M in field.ts.
 */
const HEAT_RADIUS: ExpressionSpecification = ["interpolate", ["exponential", 2], ["zoom"], 14, 36.85, 19, 1179.2];

/** Pinging again sooner than this, or for a move smaller than this, is not worth a request. */
const MIN_MOVE_M = 25;
const MIN_GAP_MS = 4_000;

function useSnapshotPolling() {
  usePolling((signal) => loadSnapshot(signal), { intervalMs: POLL_MS });
  usePolling((signal) => loadSharing(signal), { intervalMs: null });
}

/** Posts the user's position while sharing is on: when they move, and every minute. */
function useSharingPinger() {
  const sharing = useStore(densityStore, (s) => s.sharing);
  const { position } = useUserLocation();
  const latest = useRef(position);
  const last = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const native = isNativeShell();

  useEffect(() => {
    latest.current = position;
  }, [position]);

  const ping = async () => {
    const pos = latest.current;
    if (!pos) return;
    last.current = { lat: pos.lat, lng: pos.lng, at: Date.now() };
    try {
      await apiFetch("/api/presence/ping", { method: "POST", body: { lat: pos.lat, lng: pos.lng, accuracyM: pos.accuracyM } });
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === "SHARING_OFF") densityStore.set({ sharing: false });
    }
  };

  // sharing just turned off: forget the last ping so turning it back on pings at once
  useEffect(() => {
    if (!sharing) last.current = null;
  }, [sharing]);

  // a new fix that moved: ping now, so the heatmap follows the user
  useEffect(() => {
    if (!sharing || native || !position) return;
    const prev = last.current;
    if (prev && (Date.now() - prev.at < MIN_GAP_MS || haversineM(prev, position) < MIN_MOVE_M)) return;
    void ping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, native, position?.lat, position?.lng]);

  // the minute heartbeat keeps the ten-minute presence alive while standing still
  usePolling(() => (latest.current ? ping() : undefined), { intervalMs: PING_MS, enabled: sharing === true && !native, key: sharing });
}

export function DensityLayer() {
  useSnapshotPolling();
  useSharingPinger();

  const snapshot = useStore(densityStore, (s) => s.snapshot);
  const mode = modeById(useStore(densityStore, (s) => s.mode));
  const ramp: RampId = mode.ramp ?? "green";
  const buildings = useApi<BuildingCollection>("/api/campus/buildings");
  const { selectedPlaceId } = useMapStore();

  // the remembered on/off choice, read after mount so the first render matches the server's
  useEffect(() => restoreHeatMode(), []);

  // names for the panel
  useEffect(() => {
    if (!buildings.data) return;
    const names: Record<string, string> = {};
    for (const f of buildings.data.features) {
      const { placeId, name } = f.properties;
      if (placeId && name) names[placeId] = name;
    }
    densityStore.set({ names });
  }, [buildings.data]);

  const heat = useMemo(() => heatData(snapshot), [snapshot]);
  // slightly enlarged copies of every building, and where to sample the field for each
  const grown = useMemo(() => {
    const features = buildings.data ? growBuildings(buildings.data, TINT_GROW_M) : [];
    return features.map((f) => ({ feature: f, center: featureCenter(f) }));
  }, [buildings.data]);
  const tint = useMemo(() => tintData(grown, snapshot, ramp), [grown, snapshot, ramp]);
  // read the freshest data inside the effects that create the sources
  const latest = useRef({ heat, tint });
  useEffect(() => {
    latest.current = { heat, tint };
  });

  useMapEffect((map) => {
    map.addSource(HEAT_SRC, { type: "geojson", data: latest.current.heat });
    addLayerToSlot(
      map,
      {
        id: HEAT_LAYER,
        type: "heatmap",
        source: HEAT_SRC,
        paint: {
          "heatmap-weight": ["get", "w"],
          "heatmap-intensity": 3.2, // FIELD_INTENSITY
          "heatmap-radius": HEAT_RADIUS,
          // opaque green at zero density: the field covers the whole map, not just near people
          "heatmap-color": rampExpression(ramp, mode.grass) as ExpressionSpecification,
          "heatmap-opacity": 1,
        },
      },
      "slot-ground",
    );
    return () => removeLayersAndSources(map, [HEAT_LAYER], [HEAT_SRC]);
  }, []);

  useMapEffect(
    (map) => {
      if (!buildings.data) return;
      map.addSource(TINT_SRC, { type: "geojson", data: latest.current.tint, tolerance: 0.2 });
      addLayerToSlot(
        map,
        {
          id: TINT_LAYER,
          type: "fill-extrusion",
          source: TINT_SRC,
          paint: {
            "fill-extrusion-base": 0,
            // a hair taller than the building, so the roof wins the depth test too
            "fill-extrusion-height": ["+", ["get", "heightM"], 0.15],
            "fill-extrusion-color": ["get", "color"],
            "fill-extrusion-opacity": 0.95,
          },
        },
        "slot-buildings",
      );
      return () => removeLayersAndSources(map, [TINT_LAYER], [TINT_SRC]);
    },
    [Boolean(buildings.data)],
  );

  // new data on every poll, without rebuilding the layers
  useMapEffect(
    (map) => {
      (map.getSource(HEAT_SRC) as { setData?: (d: GeoJSON.FeatureCollection) => void } | undefined)?.setData?.(heat);
      (map.getSource(TINT_SRC) as { setData?: (d: GeoJSON.FeatureCollection) => void } | undefined)?.setData?.(tint);
    },
    [heat, tint],
  );

  // On or off. Campus adds its ground layers when its own data arrives, maybe after this layer
  // does, so everything is re-applied whenever the style changes; each step is a no-op when
  // already in place, so this settles at once.
  useMapEffect(
    (map) => {
      let original: FilterSpecification | null | undefined;
      const hasHeat = mode.ramp !== null;
      const colorKey = JSON.stringify(rampExpression(ramp, mode.grass));
      const apply = () => {
        const visibility = hasHeat ? "visible" : "none";
        for (const id of [HEAT_LAYER, TINT_LAYER]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
        if (map.getLayer(HEAT_LAYER) && hasHeat) {
          if (JSON.stringify(map.getPaintProperty(HEAT_LAYER, "heatmap-color")) !== colorKey) {
            map.setPaintProperty(HEAT_LAYER, "heatmap-color", JSON.parse(colorKey) as ExpressionSpecification);
          }
        }
        if (!map.getLayer(GROUND_FILL)) return;
        // grass, parking and water: hidden (water stays) in the full modes, as campus draws them otherwise
        const hideGrass = hasHeat && !mode.grass;
        if (hideGrass) {
          original ??= map.getFilter(GROUND_FILL) ?? null;
          if (JSON.stringify(map.getFilter(GROUND_FILL)) !== JSON.stringify(WATER_ONLY)) map.setFilter(GROUND_FILL, WATER_ONLY);
        } else if (original !== undefined) {
          map.setFilter(GROUND_FILL, original);
        }
        // Where the heat sits: under the ground fill (full modes) or under the roads, over the grass.
        if (hasHeat && map.getLayer(HEAT_LAYER)) {
          const anchor = mode.grass ? ROAD_CASING : GROUND_FILL;
          if (map.getLayer(anchor)) {
            const order = map.getStyle().layers.map((l) => l.id);
            if (order.indexOf(HEAT_LAYER) !== order.indexOf(anchor) - 1) map.moveLayer(HEAT_LAYER, anchor);
          }
        }
      };
      apply();
      map.on("styledata", apply);
      return () => {
        map.off("styledata", apply);
        // leave the campus layer as we found it (also when the layer unmounts)
        if (original !== undefined && map.getLayer(GROUND_FILL)) map.setFilter(GROUND_FILL, original);
      };
    },
    [mode.id],
  );

  // leave the selected building to the campus layer's maroon highlight
  useMapEffect(
    (map) => {
      if (!map.getLayer(TINT_LAYER)) return;
      map.setFilter(TINT_LAYER, ["!=", ["get", "placeId"], selectedPlaceId ?? ""]);
    },
    [selectedPlaceId, Boolean(buildings.data)],
  );

  return <Legend overlay snapshot={snapshot} />;
}

function heatData(snapshot: DensityResponse | null): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: (snapshot?.points ?? []).map((p) => ({
      type: "Feature" as const,
      properties: { w: pointWeight(p.weight), source: p.source },
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
    })),
  };
}

/** Every building, coloured by the field at its centre: the same number the heat layer draws under it. */
function tintData(
  grown: { feature: GeoJSON.Feature; center: { lat: number; lng: number } }[],
  snapshot: DensityResponse | null,
  ramp: RampId,
): GeoJSON.FeatureCollection {
  const points = snapshot?.points ?? [];
  return {
    type: "FeatureCollection",
    features: grown.map(({ feature, center }) => ({
      ...feature,
      properties: {
        heightM: feature.properties?.heightM,
        placeId: (feature.properties?.placeId as string | undefined) ?? "",
        color: rampColor(densityAt(points, center), ramp),
      },
    })),
  };
}
