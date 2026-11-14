"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ExpressionSpecification } from "maplibre-gl";
import type { BuildingCollection, DensityResponse } from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { haversineM } from "@/shared/geo";
import { isNativeShell, useUserLocation } from "@/shared/platform";
import { addLayerToSlot, removeLayersAndSources, useApi, useMapEffect, useMapStore, usePolling } from "@/shared/ui";
import { useStore } from "@/shared/ui/store";
import { growBuildings } from "./geometry";
import { LEVEL_COLORS } from "./levels";
import { Legend } from "./Legend";
import { densityStore, loadSharing, loadSnapshot, PING_MS, POLL_MS } from "./state";

/**
 * The heatmap and the building tint. Polls the snapshot every ten seconds (paused while
 * the tab is hidden), draws a heat layer under the lines and a thin coloured cap on top of
 * each busy building, and, when the user has chosen to share, pings the server with their
 * position. In the Android shell the native pinger does the pinging instead.
 * Layer ids are prefixed `density-`.
 */

const HEAT_SRC = "density-points";
const HEAT_LAYER = "density-heat";
const TINT_SRC = "density-tint";
const TINT_LAYER = "density-tint-3d";
/** The tint is a full-height copy of each busy building, this much bigger so its walls never share a plane with the campus building. */
const TINT_GROW_M = 0.3;

const HEAT_COLOR: ExpressionSpecification = [
  "interpolate", ["linear"], ["heatmap-density"],
  0, "rgba(255,214,102,0)",
  0.1, "rgba(255,214,102,0.7)",
  0.3, "rgba(250,160,50,0.85)",
  0.55, "rgba(236,84,40,0.92)",
  0.8, "rgba(196,30,28,0.96)",
  1, "rgba(120,10,20,1)",
];

const TINT_COLOR: ExpressionSpecification = [
  "match", ["get", "level"],
  1, LEVEL_COLORS[1],
  2, LEVEL_COLORS[2],
  3, LEVEL_COLORS[3],
  4, LEVEL_COLORS[4],
  LEVEL_COLORS[0],
];

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
  const buildings = useApi<BuildingCollection>("/api/campus/buildings");

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
  const grown = useMemo(() => (buildings.data ? growBuildings(buildings.data, TINT_GROW_M) : []), [buildings.data]);
  const caps = useMemo(() => tintData(grown, snapshot), [grown, snapshot]);
  const { selectedPlaceId } = useMapStore();
  // read the freshest data inside the effects that create the sources
  const latest = useRef({ heat, caps });
  useEffect(() => {
    latest.current = { heat, caps };
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
          // weights from the API reach 1 only at 50 people, so boost them: a busy place should glow
          "heatmap-weight": ["min", 1, ["*", ["get", "weight"], 3]],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 14, 1.6, 19, 3],
          "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 14, 34, 19, 520],
          "heatmap-color": HEAT_COLOR,
          "heatmap-opacity": 0.95,
        },
      },
      "slot-ground",
    );
    return () => removeLayersAndSources(map, [HEAT_LAYER], [HEAT_SRC]);
  }, []);

  useMapEffect(
    (map) => {
      if (!buildings.data) return;
      map.addSource(TINT_SRC, { type: "geojson", data: latest.current.caps, tolerance: 0.2 });
      addLayerToSlot(
        map,
        {
          id: TINT_LAYER,
          type: "fill-extrusion",
          source: TINT_SRC,
          filter: [">", ["get", "level"], 1],
          paint: {
            "fill-extrusion-base": 0,
            // a hair taller than the building, so the roof wins the depth test too
            "fill-extrusion-height": ["+", ["get", "heightM"], 0.15],
            "fill-extrusion-color": TINT_COLOR,
            "fill-extrusion-opacity": 0.93,
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
      (map.getSource(TINT_SRC) as { setData?: (d: GeoJSON.FeatureCollection) => void } | undefined)?.setData?.(caps);
    },
    [heat, caps],
  );

  // leave the selected building to the campus layer's maroon highlight
  useMapEffect(
    (map) => {
      if (!map.getLayer(TINT_LAYER)) return;
      map.setFilter(TINT_LAYER, [
        "all",
        [">", ["get", "level"], 1],
        ["!=", ["get", "placeId"], selectedPlaceId ?? ""],
      ]);
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
      properties: { weight: p.weight, source: p.source },
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
    })),
  };
}

function tintData(grown: GeoJSON.Feature[], snapshot: DensityResponse | null): GeoJSON.FeatureCollection {
  const level = new Map((snapshot?.places ?? []).map((p) => [p.placeId, p.level]));
  return {
    type: "FeatureCollection",
    features: grown.map((f) => {
      const placeId = (f.properties?.placeId as string | undefined) ?? "";
      return { ...f, properties: { heightM: f.properties?.heightM, placeId, level: level.get(placeId) ?? 0 } };
    }),
  };
}
