"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Place } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import { useUserLocation } from "@/shared/platform";
import { useMapStore } from "@/shared/ui";
import { BallIcon, BookIcon, BuildingIcon, CloseIcon, GoIcon, HomeIcon, PinIcon, SearchIcon, SparkleIcon, UtensilsIcon } from "./icons";

const CATEGORY_LABEL: Record<Place["category"], string> = {
  academic: "Academic building",
  library: "Library",
  dining: "Food",
  residence: "Residence hall",
  athletic: "Athletics",
  student_life: "Student life",
  other: "Campus building",
};

type IconC = (p: { className?: string }) => ReactNode;
const CATEGORY_ICON: Record<Place["category"], IconC> = {
  academic: BuildingIcon,
  library: BookIcon,
  dining: UtensilsIcon,
  residence: HomeIcon,
  athletic: BallIcon,
  student_life: SparkleIcon,
  other: PinIcon,
};

function PlaceIcon({ category, className }: { category: Place["category"]; className?: string }) {
  const Icon = CATEGORY_ICON[category];
  return <Icon className={className} />;
}

/**
 * The search box over the map, and the card for the selected place. "Directions" (or the arrow
 * on a result) routes from the user's location: it asks for location at once, and the route
 * card falls back to a starting building when location is unavailable. Choosing a result
 * selects the place and flies to it; tapping a building on the map selects it too. The card
 * hides while a route is shown (the route card takes over).
 */
export function RoutingSearch() {
  const { selectedPlaceId, routeRequest, selectPlace, flyTo, requestRoute } = useMapStore();
  const { position, start: startLocation, status } = useUserLocation();
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

  const shown = q.trim() ? results.slice(0, 8) : [];
  const card = selectedPlaceId && selected?.id === selectedPlaceId && !routeRequest ? selected : null;

  const clearQuery = () => {
    setQ("");
    setResults([]);
  };

  const choose = (place: Place) => {
    setSelected(place);
    selectPlace(place.id);
    flyTo(place.center, { zoom: 18 });
    clearQuery();
  };

  const directions = (place: Place) => {
    if (!position && status !== "denied" && status !== "unavailable") startLocation();
    setSelected(place);
    selectPlace(place.id);
    requestRoute(place.id);
    clearQuery();
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 rounded-full bg-white py-1 pl-3 pr-1 text-ink shadow-md shadow-ink/20 ring-1 ring-ink/5 focus-within:ring-2 focus-within:ring-ink/40">
        <SearchIcon className="h-5 w-5 shrink-0 text-yale" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown[0]) directions(shown[0]);
            if (e.key === "Escape") clearQuery();
          }}
          placeholder="Where to?"
          aria-label="Search buildings for directions"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-ink outline-none placeholder:text-yale/60 [&::-webkit-search-cancel-button]:hidden"
        />
        {q ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={clearQuery}
            className="flex h-8 w-8 items-center justify-center rounded-full text-yale hover:bg-linen"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        ) : (
          <span
            aria-hidden
            title={position ? "Using your location" : "Location off"}
            className={`mr-1 h-2.5 w-2.5 rounded-full ${position ? "bg-[#118a5b]" : "bg-ash"}`}
          />
        )}
      </div>

      {shown.length > 0 ? (
        <ul className="absolute left-0 right-0 z-20 mt-2 max-h-72 overflow-auto rounded-2xl bg-white py-1 text-ink shadow-lg shadow-ink/20">
          {shown.map((place) => (
            <li key={place.id} className="flex items-center gap-1 pr-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-linen"
                onClick={() => choose(place)}
              >
                <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linen text-ink">
                  <PlaceIcon category={place.category} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{place.name}</span>
                  <span className="block truncate text-xs text-yale">{CATEGORY_LABEL[place.category]}</span>
                </span>
              </button>
              <button
                type="button"
                aria-label={`Directions to ${place.name}`}
                title="Directions from my location"
                onClick={() => directions(place)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-ivory hover:bg-yale"
              >
                <GoIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {card && !shown.length ? (
        <div className="mt-2 flex items-center gap-3 rounded-2xl bg-white p-3 text-ink shadow-md shadow-ink/20">
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linen text-ink">
            <PlaceIcon category={card.category} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{card.name}</div>
            <div className="truncate text-xs text-yale">
              {CATEGORY_LABEL[card.category]}
              {card.studyFriendly ? " · good for studying" : ""}
              {card.aliases.length ? ` · ${card.aliases.slice(0, 3).join(", ")}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={() => directions(card)}
            className="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-sm font-semibold text-ivory shadow-sm hover:bg-yale"
          >
            <GoIcon className="h-4 w-4" />
            Go
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={() => selectPlace(null)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-yale hover:bg-linen"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
