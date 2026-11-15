"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ActivityList, DensityResponse, PlannedEventList, type Activity, type DensityPlace, type Place, type PlannedEvent } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import { mapStore } from "@/shared/ui";
import { CloseIcon, GoIcon } from "./icons";

/** Same words as the crowd panel (density/ui/levels.ts), which this module cannot import. */
const LEVEL_LABELS = ["Empty", "Quiet", "Moderate", "Busy", "Packed"] as const;
const LEVEL_DOT = ["bg-ash", "bg-[#7cc47f]", "bg-[#f2c94c]", "bg-[#f2994a]", "bg-[#d64545]"] as const;

const SWIPE_PX = 48;
const TAP_PX = 6;

interface Here {
  crowd: DensityPlace | null;
  activities: Activity[];
  events: PlannedEvent[];
  /** When this was loaded, to tell events already under way. */
  loadedAt: number;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Phones only (the routing search renders it below 768 px instead of its top card): a bottom
 * sheet for the building tapped on the map, with what the card showed (name, category, study
 * spot, nicknames, Go) plus how busy it is and what is happening there. It opens compact and can
 * be pulled up taller. Closes with ×, a swipe down from compact, or a tap on empty map.
 */
export function PlaceSheet({
  place,
  categoryLabel,
  icon,
  onGo,
  onClose,
}: {
  place: Place;
  categoryLabel: string;
  icon: ReactNode;
  onGo: () => void;
  onClose: () => void;
}) {
  const [tall, setTall] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<number | null>(null);
  const [here, setHere] = useState<Here | null>(null);

  // what is there: crowd level, live activities and planned events at this building (the parent
  // keys this component by place id, so a new building starts with fresh state)
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      apiFetch("/api/density", { schema: DensityResponse, signal }).catch(() => null),
      apiFetch("/api/activities", { schema: ActivityList, signal }).catch(() => []),
      apiFetch("/api/planned-events", { schema: PlannedEventList, signal }).catch(() => []),
    ]).then(([density, activities, events]) => {
      if (signal.aborted) return;
      const now = Date.now();
      setHere({
        crowd: density?.places.find((p) => p.placeId === place.id) ?? null,
        activities: activities.filter((a) => a.placeId === place.id && a.status === "active"),
        events: events
          .filter((e) => e.placeId === place.id && new Date(e.endsAt).getTime() > now)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .slice(0, 5),
        loadedAt: now,
      });
    });
    return () => controller.abort();
  }, [place.id]);

  // A tap on empty map closes it; a tap on a building selects that one instead. The search (and
  // so this sheet) is rendered outside the map's React context, so watch the map canvas in the
  // DOM: from the finger going down until just after the click, any map-store update means the
  // campus layer selected a building; no update means the tap hit empty map. Drags send no click.
  useEffect(() => {
    let watching: { touched: boolean; unsubscribe: () => void } | null = null;
    const stop = () => {
      watching?.unsubscribe();
      watching = null;
    };
    const onCanvas = (e: Event) => e.target instanceof Element && e.target.closest(".maplibregl-canvas-container") !== null;
    const onDown = (e: Event) => {
      stop();
      if (!onCanvas(e)) return;
      const w = { touched: false, unsubscribe: () => {} };
      w.unsubscribe = mapStore.subscribe(() => {
        w.touched = true;
      });
      watching = w;
    };
    const onClick = (e: Event) => {
      if (!watching || !onCanvas(e)) return;
      const w = watching;
      setTimeout(() => {
        w.unsubscribe();
        if (watching === w) watching = null;
        if (!w.touched) onClose();
      }, 0);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("click", onClick, true);
      stop();
    };
  }, [onClose]);

  // pull on the header: up makes it tall, down makes it compact, down again closes
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    start.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(0);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return;
    setDrag(Math.max(e.clientY - start.current, tall ? -40 : -200));
  };
  const onPointerUp = () => {
    const dy = drag ?? 0;
    start.current = null;
    setDrag(null);
    if (Math.abs(dy) < TAP_PX) setTall((t) => !t);
    else if (dy < -SWIPE_PX) setTall(true);
    else if (dy > SWIPE_PX) {
      if (tall) setTall(false);
      else onClose();
    }
  };

  const crowd = here?.crowd;
  const happening = (here?.activities.length ?? 0) + (here?.events.length ?? 0);

  return (
    <div
      role="dialog"
      aria-label={place.name}
      style={{
        transform: drag && drag > 0 ? `translateY(${drag}px)` : undefined,
        transition: drag === null ? "transform 220ms ease, max-height 260ms cubic-bezier(.2,.8,.2,1)" : "none",
      }}
      className={`fixed inset-x-0 bottom-0 flex flex-col rounded-t-3xl bg-white text-ink shadow-[0_-8px_24px_rgba(21,50,67,0.25)] ${
        tall ? "h-[85dvh]" : "max-h-[55dvh]"
      } pb-[calc(env(safe-area-inset-bottom)_+_5.25rem)]`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={tall}
        aria-label={tall ? "Show less" : "Show more"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setTall((t) => !t);
          } else if (e.key === "Escape") onClose();
        }}
        className="shrink-0 cursor-grab touch-none select-none px-4 pb-2 pt-2"
      >
        <div aria-hidden className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-ash" />
        <div className="flex items-center gap-3">
          <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-linen text-ink">
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{place.name}</h2>
            <p className="truncate text-xs text-yale">
              {categoryLabel}
              {place.studyFriendly ? " · good for studying" : ""}
              {place.aliases.length ? ` · ${place.aliases.slice(0, 3).join(", ")}` : ""}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-yale hover:bg-linen"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4">
        <div className="flex items-center gap-2 text-sm">
          <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${crowd ? LEVEL_DOT[crowd.level] : "bg-ash"}`} />
          <span>
            {here === null
              ? "Checking how busy it is…"
              : crowd
                ? `${LEVEL_LABELS[crowd.level]} now${crowd.live > 0 ? ` · ${crowd.live} here live` : ""}${crowd.simulated > 0 ? " · simulated" : ""}`
                : "No crowd data for this building"}
          </span>
        </div>

        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-yale">Happening here</h3>
          {here === null ? <p className="text-sm text-yale">Loading…</p> : null}
          {here && happening === 0 ? <p className="text-sm text-yale">Nothing happening here right now.</p> : null}
          <ul className="space-y-1.5">
            {here?.activities.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-xl bg-linen px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{a.title}</span>
                <span className="shrink-0 text-xs text-yale">
                  Live · {a.participantCount}
                  {a.capacity ? `/${a.capacity}` : ""}
                </span>
              </li>
            ))}
            {here?.events.map((e) => (
              <li key={e.id} className="flex items-center gap-2 rounded-xl bg-linen px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
                <span className="shrink-0 text-xs text-yale">
                  {new Date(e.startsAt).getTime() <= here.loadedAt ? "Now" : timeLabel(e.startsAt)} · {e.goingCount} going
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="shrink-0 px-4 pt-3">
        <button
          type="button"
          onClick={onGo}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-4 py-3 text-base font-semibold text-ivory shadow-sm hover:bg-yale"
        >
          <GoIcon className="h-5 w-5" />
          Go
        </button>
      </div>
    </div>
  );
}
