"use client";

import { useEffect, useState } from "react";
import type { Place } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import { useMapStore } from "@/shared/ui";

const CATEGORY_LABEL: Record<Place["category"], string> = {
  academic: "Academic building",
  library: "Library",
  dining: "Food",
  residence: "Residence hall",
  athletic: "Athletics",
  student_life: "Student life",
  other: "Campus building",
};

/**
 * The search box in the top slot, and the card for the selected place with "Directions".
 * Choosing a result selects the place and flies to it; tapping a building on the map selects
 * it too. The card hides while a route is shown (the route card takes over).
 */
export function RoutingSearch() {
  const { selectedPlaceId, routeRequest, selectPlace, flyTo, requestRoute } = useMapStore();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);

  useEffect(() => {
    if (!q.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch<Place[]>(`/api/places?q=${encodeURIComponent(q.trim())}`, { signal: controller.signal })
        .then(setResults)
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  // details for a place selected anywhere (search, map tap, another panel)
  useEffect(() => {
    if (!selectedPlaceId) return;
    const controller = new AbortController();
    apiFetch<Place[]>(`/api/places?id=${encodeURIComponent(selectedPlaceId)}`, { signal: controller.signal })
      .then(([place]) => setSelected(place ?? null))
      .catch(() => {});
    return () => controller.abort();
  }, [selectedPlaceId]);

  const shown = q.trim() ? results : [];
  const card = selectedPlaceId && selected?.id === selectedPlaceId && !routeRequest ? selected : null;

  const choose = (place: Place) => {
    setSelected(place);
    selectPlace(place.id);
    flyTo(place.center, { zoom: 18 });
    setQ("");
    setResults([]);
  };

  return (
    <div className="relative w-full">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && shown[0]) choose(shown[0]);
          if (e.key === "Escape") setQ("");
        }}
        placeholder="Search buildings: ILC, LGRT, Frank…"
        aria-label="Search buildings"
        className="w-full rounded-full border border-neutral-200 bg-white/95 px-4 py-2 text-sm shadow-md outline-none focus:border-neutral-400"
      />
      {shown.length > 0 ? (
        <ul className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-neutral-200 bg-white shadow-lg">
          {shown.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between gap-2 px-4 py-2 text-left text-sm hover:bg-neutral-100"
                onClick={() => choose(place)}
              >
                <span>{place.name}</span>
                <span className="shrink-0 text-xs text-neutral-400">{CATEGORY_LABEL[place.category]}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {card && !shown.length ? (
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white/95 p-3 shadow-md">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-neutral-900">{card.name}</div>
            <div className="truncate text-xs text-neutral-500">
              {CATEGORY_LABEL[card.category]}
              {card.studyFriendly ? " · good for studying" : ""}
              {card.aliases.length ? ` · ${card.aliases.slice(0, 3).join(", ")}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={() => requestRoute(card.id)}
            className="rounded-full bg-[#881c1c] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#6f1616]"
          >
            Directions
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={() => selectPlace(null)}
            className="rounded-full px-2 py-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
