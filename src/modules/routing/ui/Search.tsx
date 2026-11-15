"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Place } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import { useUserLocation } from "@/shared/platform";
import { useMapStore } from "@/shared/ui";
import { PlaceSheet } from "./PlaceSheet";
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
/** Phones: below the shell's 768 px desktop breakpoint, where a tapped building gets a bottom sheet. */
const PHONE_QUERY = "(max-width: 767px)";
function subscribePhone(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function useIsPhone(): boolean {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}

export function RoutingSearch() {
  const { selectedPlaceId, routeRequest, selectPlace, flyTo, requestRoute } = useMapStore();
  const { position, start: startLocation, status } = useUserLocation();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const isPhone = useIsPhone();
  const closeCard = useCallback(() => selectPlace(null), [selectPlace]);

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
      <div className="animate-rise flex items-center gap-2 rounded-full bg-white py-1 pl-3 pr-1 text-ink shadow-lg shadow-ink/20 ring-1 ring-ink/5 transition-shadow duration-200 focus-within:shadow-xl focus-within:ring-2 focus-within:ring-ink/30">
        <SearchIcon className="h-5 w-5 shrink-0 text-yale" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            // Enter confirms an IME (Chinese, Japanese, Korean) candidate; 229 covers Safari.
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
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
            className={`mr-1 h-2.5 w-2.5 rounded-full ${position ? "bg-[#118a5b] shadow-[0_0_0_3px_rgb(17_138_91/0.18)]" : "bg-ash"}`}
          />
        )}
      </div>

      {shown.length > 0 ? (
        <ul className="animate-pop absolute left-0 right-0 z-20 mt-2 max-h-72 origin-top overflow-auto rounded-2xl bg-white p-1 text-ink shadow-xl shadow-ink/20 ring-1 ring-ink/5">
          {shown.map((place) => (
            <li key={place.id} className="group flex items-center gap-1 rounded-xl pr-1.5 hover:bg-linen">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2 text-left"
                onClick={() => choose(place)}
              >
                <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-linen text-ink transition-colors group-hover:bg-white">
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
                className="zm-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-ivory shadow-sm hover:bg-yale"
              >
                <GoIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* phones: the building gets a bottom sheet instead of the card under the search bar */}
      {card && !shown.length && isPhone ? (
        <PlaceSheet
          key={card.id}
          place={card}
          categoryLabel={CATEGORY_LABEL[card.category]}
          icon={<PlaceIcon category={card.category} className="h-5 w-5" />}
          onGo={() => directions(card)}
          onClose={closeCard}
        />
      ) : null}

      {card && !shown.length && !isPhone ? (
        <div className="animate-rise mt-2 flex items-center gap-3 rounded-2xl bg-white p-3 text-ink shadow-xl shadow-ink/20 ring-1 ring-ink/5">
          <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-jasmine to-sand text-ink shadow-sm">
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
            className="zm-press flex items-center gap-1.5 rounded-full bg-gradient-to-br from-yale to-ink px-4 py-2 text-sm font-semibold text-ivory shadow-md shadow-ink/30 hover:shadow-lg"
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
