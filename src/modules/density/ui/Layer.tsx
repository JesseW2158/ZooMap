"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ExpressionSpecification } from "maplibre-gl";
import type { BuildingCollection, DensityResponse } from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { haversineM } from "@/shared/geo";
import { isNativeShell, useUserLocation } from "@/shared/platform";
import { addLayerToSlot, removeLayersAndSources, useApi, useMapEffect, usePolling } from "@/shared/ui";
import { useStore } from "@/shared/ui/store";
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
const CAP_SRC = "density-caps";
const CAP_LAYER = "density-caps-3d";
/** The cap sits on the roof so it never fights the campus building underneath it. */
const CAP_THICKNESS_M = 2.5;

const HEAT_COLOR: ExpressionSpecification = [
  "interpolate", ["linear"], ["heatmap-density"],
  0, "rgba(246,231,161,0)",
  0.15, "rgba(246,231,161,0.55)",
  0.4, "rgba(244,184,96,0.7)",
  0.7, "rgba(228,87,46,0.8)",
  1, "rgba(140,28,19,0.9)",
];

const CAP_COLOR: ExpressionSpecification = [
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
  const caps = useMemo(() => capData(buildings.data, snapshot), [buildings.data, snapshot]);
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
          "heatmap-weight": ["get", "weight"],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 14, 0.9, 19, 1.8],
          "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 14, 22, 19, 360],
          "heatmap-color": HEAT_COLOR,
          "heatmap-opacity": 0.85,
        },
      },
      "slot-ground",
    );
    return () => removeLayersAndSources(map, [HEAT_LAYER], [HEAT_SRC]);
  }, []);

  useMapEffect(
    (map) => {
      if (!buildings.data) return;
      map.addSource(CAP_SRC, { type: "geojson", data: latest.current.caps, tolerance: 0.2 });
      addLayerToSlot(
        map,
        {
          id: CAP_LAYER,
          type: "fill-extrusion",
          source: CAP_SRC,
          filter: [">", ["get", "level"], 1],
          paint: {
            "fill-extrusion-base": ["get", "heightM"],
            "fill-extrusion-height": ["+", ["get", "heightM"], CAP_THICKNESS_M],
            "fill-extrusion-color": CAP_COLOR,
            "fill-extrusion-opacity": 0.95,
          },
        },
        "slot-buildings",
      );
      return () => removeLayersAndSources(map, [CAP_LAYER], [CAP_SRC]);
    },
    [Boolean(buildings.data)],
  );

  // new data on every poll, without rebuilding the layers
  useMapEffect(
    (map) => {
      (map.getSource(HEAT_SRC) as { setData?: (d: GeoJSON.FeatureCollection) => void } | undefined)?.setData?.(heat);
      (map.getSource(CAP_SRC) as { setData?: (d: GeoJSON.FeatureCollection) => void } | undefined)?.setData?.(caps);
    },
    [heat, caps],
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

function capData(buildings: BuildingCollection | null, snapshot: DensityResponse | null): GeoJSON.FeatureCollection {
  if (!buildings) return { type: "FeatureCollection", features: [] };
  const level = new Map((snapshot?.places ?? []).map((p) => [p.placeId, p.level]));
  return {
    type: "FeatureCollection",
    features: buildings.features.map((f) => ({
      ...f,
      properties: { heightM: f.properties.heightM, placeId: f.properties.placeId ?? "", level: level.get(f.properties.placeId ?? "") ?? 0 },
    })) as GeoJSON.Feature[],
  };
}
