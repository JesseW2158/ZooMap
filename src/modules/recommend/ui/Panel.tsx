"use client";

import { useEffect, useRef, useState } from "react";
import { PlaceList, RecommendResponse, type Place, type RecommendBody, type RecommendPrefs } from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { startLocation, useUserLocation } from "@/shared/platform";
import { CAMPUS_CENTER, useMapStore } from "@/shared/ui";

/** "Find a spot": preference chips, an optional note, the pick with its reason, two alternatives. */

type Crowd = "quiet" | "social" | null;
const CLOSE_BY_MIN = 10;
const TIME_OPTIONS = [
  { label: "Any time", value: undefined },
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
  { label: "3+ hours", value: 180 },
] as const;

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
    on ? "border-ink bg-ink text-white" : "border-ash bg-white text-yale hover:bg-ivory"
  }`;

/** Names for the returned place ids, fetched once each. */
function usePlaceNames(ids: string[]) {
  const [names, setNames] = useState<Record<string, Place>>({});
  const asked = useRef(new Set<string>());
  const key = ids.join(",");
  useEffect(() => {
    for (const id of key ? key.split(",") : []) {
      if (asked.current.has(id)) continue;
      asked.current.add(id);
      apiFetch(`/api/places?id=${encodeURIComponent(id)}`, { schema: PlaceList })
        .then(([p]) => p && setNames((n) => ({ ...n, [id]: p })))
        .catch(() => asked.current.delete(id));
    }
  }, [key]);
  return names;
}

export function RecommendPanel() {
  const [crowd, setCrowd] = useState<Crowd>("quiet");
  const [closeBy, setCloseBy] = useState(false);
  const [nearNext, setNearNext] = useState(false);
  const [minutes, setMinutes] = useState<number | undefined>(undefined);
  const [text, setText] = useState("");
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { position, status } = useUserLocation();
  const { selectedPlaceId, selectPlace, requestRoute } = useMapStore();
  const names = usePlaceNames(result ? [result.placeId, ...result.alternatives.map((a) => a.placeId)] : []);
  const selectedName = usePlaceNames(selectedPlaceId ? [selectedPlaceId] : [])[selectedPlaceId ?? ""]?.name;

  // Where we measure walking from: the user's position, else the building picked on the map, else the campus centre.
  const origin: RecommendBody["origin"] = position
    ? { lat: position.lat, lng: position.lng }
    : selectedPlaceId
      ? { placeId: selectedPlaceId }
      : { lat: CAMPUS_CENTER.lat, lng: CAMPUS_CENTER.lng };
  const originLabel = position ? "your location" : selectedPlaceId ? (selectedName ?? "the selected building") : "the campus centre";
  // Route from a building when that is the origin; from the user's position otherwise (the routing layer's default).
  const routeFrom = !position && selectedPlaceId ? { fromPlaceId: selectedPlaceId } : {};

  const find = async () => {
    const prefs: RecommendPrefs = {
      ...(crowd ? { quiet: crowd === "quiet" } : {}),
      ...(closeBy ? { maxWalkMinutes: CLOSE_BY_MIN } : {}),
      ...(minutes ? { minutesAvailable: minutes } : {}),
      ...(nearNext ? { nearNextClass: true } : {}),
      ...(text.trim() ? { text: text.trim().slice(0, 280) } : {}),
    };
    setLoading(true);
    setError(null);
    try {
      setResult(await apiFetch("/api/recommend", { method: "POST", body: { origin, prefs }, schema: RecommendResponse }));
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.code === "UNAUTHORIZED"
          ? "Sign in to get a recommendation."
          : err instanceof Error
            ? err.message
            : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  };

  const go = (placeId: string) => {
    selectPlace(placeId);
    requestRoute(placeId, routeFrom);
  };

  return (
    <div className="space-y-3 text-sm text-ink">
      <p className="text-xs text-yale">Find a study spot: picks a place for right now from crowd levels, walking time and your next class.</p>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Preferences">
        <button type="button" aria-pressed={crowd === "quiet"} className={chip(crowd === "quiet")} onClick={() => setCrowd(crowd === "quiet" ? null : "quiet")}>
          Quiet
        </button>
        <button type="button" aria-pressed={crowd === "social"} className={chip(crowd === "social")} onClick={() => setCrowd(crowd === "social" ? null : "social")}>
          Social
        </button>
        <button type="button" aria-pressed={closeBy} className={chip(closeBy)} onClick={() => setCloseBy(!closeBy)}>
          Close by
        </button>
        <button type="button" aria-pressed={nearNext} className={chip(nearNext)} onClick={() => setNearNext(!nearNext)}>
          Near my next class
        </button>
      </div>

      <label className="flex items-center gap-2 text-xs text-yale">
        Time I have
        <select
          className="rounded-lg border border-ash bg-white px-2 py-1 text-xs text-ink"
          value={minutes ?? ""}
          onChange={(e) => setMinutes(e.target.value ? Number(e.target.value) : undefined)}
        >
          {TIME_OPTIONS.map((o) => (
            <option key={o.label} value={o.value ?? ""}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <input
        type="text"
        value={text}
        maxLength={280}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter confirms an IME (Chinese, Japanese, Korean) candidate; 229 covers Safari.
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === "Enter" && !loading) void find();
        }}
        placeholder="Anything else? e.g. outlets, near coffee"
        className="w-full rounded-lg border border-ash bg-white px-3 py-2 text-sm placeholder:text-neutral-400"
      />

      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-yale">
          Walking from {originLabel}.
          {!position && status !== "active" ? (
            <>
              {" "}
              <button type="button" className="underline" onClick={() => startLocation()}>
                Use my location
              </button>
            </>
          ) : null}
        </p>
        <button
          type="button"
          onClick={() => void find()}
          disabled={loading}
          className="shrink-0 rounded-lg bg-ink px-4 py-1.5 font-medium text-white disabled:opacity-60"
        >
          {loading ? "Thinking…" : "Find a spot"}
        </button>
      </div>

      {error ? <p className="text-xs text-red-700">{error}</p> : null}

      {result ? (
        <div className="space-y-2">
          <section className="rounded-xl border border-ash bg-ivory p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-yale">Best pick</span>
              <SourceBadge source={result.source} />
            </div>
            <div className="mt-0.5 text-base font-semibold">{names[result.placeId]?.name ?? "…"}</div>
            <p className="mt-1 text-sm text-yale">{result.reason}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => go(result.placeId)} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white">
                Route there
              </button>
              <button type="button" onClick={() => selectPlace(result.placeId)} className="rounded-lg border border-ash bg-white px-3 py-1.5 text-xs text-ink">
                Show on map
              </button>
            </div>
          </section>

          {result.alternatives.length ? (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-yale">Also good</h3>
              <ul className="divide-y divide-ash/50">
                {result.alternatives.map((a) => (
                  <li key={a.placeId} className="flex items-start gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{names[a.placeId]?.name ?? "…"}</div>
                      <p className="text-xs text-yale">{a.reason}</p>
                    </div>
                    <button type="button" onClick={() => go(a.placeId)} className="shrink-0 rounded-lg border border-ash bg-white px-2.5 py-1 text-xs">
                      Route
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SourceBadge({ source }: { source: RecommendResponse["source"] }) {
  return source === "gemini" ? (
    <span className="rounded-full bg-lavender/40 px-2 py-0.5 text-[11px] text-ink">Picked by Gemini</span>
  ) : (
    <span className="rounded-full bg-sand/50 px-2 py-0.5 text-[11px] text-ink" title="Gemini was unavailable, so MinuteMap's own scoring picked this.">
      Fallback pick (no AI)
    </span>
  );
}
