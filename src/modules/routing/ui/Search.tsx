"use client";

import { useEffect, useState } from "react";
import type { Place } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import { useMapStore } from "@/shared/ui";

/**
 * FOUNDATION STUB (owner: ws-routing): the search box in the top slot. It already searches
 * `/api/places`, selects the place and flies to it; the stream adds "walk there".
 */
export function RoutingSearch() {
  const { selectPlace, flyTo } = useMapStore();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);

  useEffect(() => {
    if (!q.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch<Place[]>(`/api/places?q=${encodeURIComponent(q.trim())}`, { signal: controller.signal })
        .then(setResults)
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  const shown = q.trim() ? results : [];

  return (
    <div className="relative w-full">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search buildings"
        aria-label="Search buildings"
        className="w-full rounded-full border border-neutral-200 bg-white/95 px-4 py-2 text-sm shadow-md outline-none focus:border-neutral-400"
      />
      {shown.length > 0 ? (
        <ul className="absolute left-0 right-0 mt-1 max-h-64 overflow-auto rounded-xl border border-neutral-200 bg-white shadow-lg">
          {shown.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-100"
                onClick={() => {
                  selectPlace(place.id);
                  flyTo(place.center, { zoom: 18 });
                  setQ("");
                  setResults([]);
                }}
              >
                {place.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
