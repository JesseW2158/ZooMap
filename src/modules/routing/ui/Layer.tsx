"use client";

import { useEffect, useState } from "react";
import type { Place, RouteProfile, RouteResult } from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { useUserLocation } from "@/shared/platform";
import { addLayerToSlot, removeLayersAndSources, useMapEffect, useMapStore } from "@/shared/ui";

/**
 * Draws whatever route `useMapStore().routeRequest` asks for, from the user's location (or a
 * chosen start building when location is unavailable), with a card: time, distance, stairs,
 * Fastest / Step-free, turn-by-turn steps and a clear button. Layer ids are prefixed `routing-`.
 */

const LINE_SRC = "routing-line";
const LINE_CASING = "routing-line-casing";
const LINE = "routing-line-main";
const ENDS_SRC = "routing-ends";
const ENDS = "routing-ends-dots";
const ROUTE_COLOR = "#1663d6";

const fmtDistance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
const fmtMinutes = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;

const STEP_ICON: Record<string, string> = { start: "●", walk: "↑", road: "↑", stairs: "⇅", cross: "⇄", end: "◆" };

interface Fetched {
  query: string;
  toPlaceId: string;
  result?: RouteResult;
  error?: string;
  offCampus?: boolean;
}

/** About 30 m: walking this far re-routes from the new position. */
const snapCoord = (v: number) => (Math.round(v / 0.0003) * 0.0003).toFixed(6);

export function RoutingLayer() {
  const { routeRequest, clearRoute, requestRoute, flyTo } = useMapStore();
  const { position, start: startLocation, status } = useUserLocation();
  const [profile, setProfile] = useState<RouteProfile>("fastest");
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);

  // the request as a query string, or null when there is nothing to ask yet
  const needLocation = !!routeRequest && !routeRequest.fromPlaceId && !position;
  let query: string | null = null;
  if (routeRequest && !needLocation) {
    const params = new URLSearchParams({ to: routeRequest.toPlaceId, profile });
    if (routeRequest.fromPlaceId) params.set("fromPlaceId", routeRequest.fromPlaceId);
    else if (position) {
      params.set("fromLat", snapCoord(position.lat));
      params.set("fromLng", snapCoord(position.lng));
    }
    query = params.toString();
  }
  const toPlaceId = routeRequest?.toPlaceId ?? null;

  useEffect(() => {
    if (!query || !toPlaceId) return;
    const controller = new AbortController();
    apiFetch<RouteResult>(`/api/route?${query}`, { signal: controller.signal })
      .then((result) => setFetched({ query, toPlaceId, result }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const e = err instanceof ApiClientError ? err : null;
        setFetched({
          query,
          toPlaceId,
          offCampus: e?.code === "OFF_CAMPUS",
          error: e?.code === "OFF_CAMPUS" ? "You're too far from campus. Pick a starting building." : (e?.message ?? "Could not get a route"),
        });
      });
    return () => controller.abort();
  }, [query, toPlaceId]);

  const current = fetched && fetched.query === query ? fetched : null;
  const loading = query !== null && !current;
  // while re-routing to the same place, keep showing the previous line
  const result = current?.result ?? (loading && fetched?.toPlaceId === toPlaceId ? fetched?.result : undefined);
  const state = { loading, error: current?.error, needStart: needLocation || !!current?.offCampus };

  // draw the line and its two ends, and frame it
  useMapEffect(
    (map) => {
      if (!result) return;
      const coords = result.line.coordinates;
      map.addSource(LINE_SRC, { type: "geojson", data: { type: "Feature", properties: {}, geometry: result.line } });
      addLayerToSlot(map, {
        id: LINE_CASING, type: "line", source: LINE_SRC,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 15, 6, 19, 14] },
      }, "slot-lines");
      addLayerToSlot(map, {
        id: LINE, type: "line", source: LINE_SRC,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ROUTE_COLOR, "line-width": ["interpolate", ["linear"], ["zoom"], 15, 3.5, 19, 9] },
      }, "slot-lines");
      map.addSource(ENDS_SRC, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            { type: "Feature", properties: { end: "start" }, geometry: { type: "Point", coordinates: coords[0] } },
            { type: "Feature", properties: { end: "end" }, geometry: { type: "Point", coordinates: coords[coords.length - 1] } },
          ],
        },
      });
      addLayerToSlot(map, {
        id: ENDS, type: "circle", source: ENDS_SRC,
        paint: {
          "circle-radius": 7,
          "circle-color": ["match", ["get", "end"], "start", "#118a5b", "#881c1c"],
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
          "circle-pitch-alignment": "map",
        },
      }, "slot-markers");

      const lngs = coords.map((c) => c[0]), lats = coords.map((c) => c[1]);
      const h = map.getContainer().clientHeight;
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: { top: 190, bottom: Math.round(h * 0.42), left: 40, right: 60 }, maxZoom: 18, duration: 800 },
      );
      return () => removeLayersAndSources(map, [ENDS, LINE, LINE_CASING], [ENDS_SRC, LINE_SRC]);
    },
    [result],
  );

  if (!routeRequest) return null;

  return (
    <div className="pointer-events-auto absolute left-[calc(var(--map-inset-left,0px)+0.75rem)] right-14 top-[calc(env(safe-area-inset-top)+4rem)] z-[6] max-h-[45dvh] overflow-auto rounded-xl border border-neutral-200 bg-white/95 p-3 text-neutral-900 shadow-md">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {result ? (
            <>
              <div className="text-lg font-semibold leading-tight text-neutral-900">
                {fmtMinutes(result.durationS)}{" "}
                <span className="text-sm font-normal text-neutral-500">
                  · {fmtDistance(result.distanceM)}
                  {result.stairs ? ` · ${result.stairs} ${result.stairs === 1 ? "stair flight" : "stair flights"}` : ""}
                </span>
              </div>
              <div className="truncate text-xs text-neutral-500">{result.steps?.at(-1)?.text}</div>
            </>
          ) : (
            <div className="text-sm text-neutral-600">{state.loading ? "Finding a route…" : (state.error ?? "Directions")}</div>
          )}
        </div>
        <button
          type="button"
          aria-label="Clear route"
          onClick={() => { clearRoute(); setStepsOpen(false); }}
          className="rounded-full px-2 py-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          ✕
        </button>
      </div>

      {state.needStart ? (
        <StartPicker
          canLocate={status !== "denied" && status !== "unavailable"}
          locating={status === "requesting"}
          onLocate={startLocation}
          onPick={(placeId) => requestRoute(routeRequest.toPlaceId, { fromPlaceId: placeId })}
        />
      ) : null}

      {result || state.loading ? (
        <div className="mt-2 flex items-center gap-2">
          <div role="group" aria-label="Route type" className="flex overflow-hidden rounded-full border border-neutral-200 text-xs">
            {(["fastest", "stepfree"] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={profile === p}
                onClick={() => setProfile(p)}
                className={`px-3 py-1 ${profile === p ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
              >
                {p === "fastest" ? "Fastest" : "Step-free"}
              </button>
            ))}
          </div>
          {result?.steps?.length ? (
            <button
              type="button"
              aria-expanded={stepsOpen}
              onClick={() => setStepsOpen((o) => !o)}
              className="ml-auto text-xs font-medium text-[#1663d6] hover:underline"
            >
              {stepsOpen ? "Hide steps" : `${result.steps.length} steps`}
            </button>
          ) : null}
        </div>
      ) : null}

      {stepsOpen && result?.steps ? (
        <ol className="mt-2 border-t border-neutral-100">
          {result.steps.map((step, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  const [lng, lat] = result.line.coordinates[Math.min(step.coordIndex, result.line.coordinates.length - 1)];
                  flyTo({ lat, lng }, { zoom: 18.5 });
                }}
                className="grid w-full grid-cols-[1.25rem_1fr_auto] items-baseline gap-2 border-b border-neutral-100 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                <span className="text-center text-xs text-[#1663d6]">{STEP_ICON[step.kind] ?? "↑"}</span>
                <span>{step.text}</span>
                <span className="text-xs tabular-nums text-neutral-400">{step.distanceM ? fmtDistance(step.distanceM) : ""}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/** Shown when there is no location: use location, or search for a starting building. */
function StartPicker(props: { canLocate: boolean; locating: boolean; onLocate: () => void; onPick: (placeId: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  useEffect(() => {
    if (!q.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch<Place[]>(`/api/places?q=${encodeURIComponent(q.trim())}`, { signal: controller.signal }).then(setResults).catch(() => {});
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q]);
  const shown = q.trim() ? results.slice(0, 5) : [];

  return (
    <div className="mt-2 space-y-2">
      {props.canLocate ? (
        <button
          type="button"
          onClick={props.onLocate}
          className="w-full rounded-full bg-[#1663d6] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1252b3]"
        >
          {props.locating ? "Finding you…" : "Use my location"}
        </button>
      ) : null}
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="…or start from a building"
        aria-label="Starting building"
        className="w-full rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400"
      />
      {shown.length ? (
        <ul className="rounded-lg border border-neutral-100">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => props.onPick(p.id)} className="w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-100">
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
