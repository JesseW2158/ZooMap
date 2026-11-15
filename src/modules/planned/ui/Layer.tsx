"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Marker, Popup } from "maplibre-gl";
import type { PlannedEvent } from "@/shared/contracts";
import { isDevPickingNow } from "@/shared/platform";
import { useMap } from "@/shared/ui";
import { usePlannedFeed, usePlannedPoller } from "./feed";
import { EventCard } from "./Panel";

/**
 * Planned events on the map: a labelled pin for each event in the next week (HTML markers,
 * since the map has no text glyphs). Tapping one opens the same card as the Events tab, with
 * "I'm going" and a route. Also owns the events poller, since the layer is always mounted.
 */

const WEEK_MS = 7 * 24 * 3_600_000;
type MapLibre = typeof import("maplibre-gl");

/** "Now", "Today 7pm", "Fri 7pm". */
function shortWhen(e: PlannedEvent, now: number): string {
  const start = new Date(e.startsAt);
  if (start.getTime() <= now) return "Now";
  const hour = start.toLocaleTimeString([], { hour: "numeric", minute: start.getMinutes() ? "2-digit" : undefined }).replace(" ", "").toLowerCase();
  const today = new Date(now).toDateString() === start.toDateString();
  return `${today ? "Today" : start.toLocaleDateString([], { weekday: "short" })} ${hour}`;
}

function pinClass(e: PlannedEvent): string {
  const tone = e.going ? "border-[#881c1c] bg-[#881c1c] text-white" : e.big ? "border-amber-400 bg-amber-50 text-amber-950" : "border-neutral-300 bg-white text-neutral-800";
  return `flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border-2 px-2 py-0.5 text-[11px] font-semibold shadow-md ${tone}`;
}

export function PlannedEventsLayer() {
  usePlannedPoller();
  const map = useMap();
  const { events } = usePlannedFeed();
  const [lib, setLib] = useState<MapLibre | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // the pop-up's content is a React portal into this element (created only in the browser)
  const [container] = useState(() => (typeof document === "undefined" ? null : document.createElement("div")));
  const markers = useRef(new Map<string, { marker: Marker; el: HTMLButtonElement }>());
  const popup = useRef<Popup | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("maplibre-gl").then((m) => {
      if (!cancelled) setLib(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // keep one marker per event in the next week
  useEffect(() => {
    if (!map || !lib) return;
    const now = Date.now();
    const shown = (events ?? []).filter((e) => e.placeCenter && new Date(e.startsAt).getTime() <= now + WEEK_MS);
    const keep = new Set(shown.map((e) => e.id));
    for (const [id, { marker }] of markers.current) {
      if (!keep.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }
    for (const e of shown) {
      let entry = markers.current.get(e.id);
      if (!entry) {
        const el = document.createElement("button");
        el.type = "button";
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          if (!isDevPickingNow()) setSelected(el.dataset.id ?? null);
        });
        const marker = new lib.Marker({ element: el, anchor: "bottom" }).setLngLat([e.placeCenter!.lng, e.placeCenter!.lat]).addTo(map);
        entry = { marker, el };
        markers.current.set(e.id, entry);
      }
      entry.el.dataset.id = e.id;
      entry.el.className = pinClass(e);
      entry.el.textContent = `${e.big ? "🎉" : "📅"} ${shortWhen(e, now)}`;
      entry.el.title = `${e.title} · ${e.placeName ?? ""}`;
      entry.el.setAttribute("aria-label", `Event: ${e.title}, ${shortWhen(e, now)}`);
    }
  }, [map, lib, events]);

  // remove every marker when the map goes away
  useEffect(() => {
    const current = markers.current;
    return () => {
      for (const { marker } of current.values()) marker.remove();
      current.clear();
    };
  }, [map]);

  const event = events?.find((e) => e.id === selected) ?? null;
  const center = event?.placeCenter;

  // the pop-up follows the selected event
  useEffect(() => {
    if (!map || !lib || !container || !center) return;
    const p = new lib.Popup({ closeButton: true, closeOnClick: true, maxWidth: "300px", offset: 30, className: "planned-popup" })
      .setLngLat([center.lng, center.lat])
      .setDOMContent(container)
      .addTo(map);
    const onClose = () => setSelected(null);
    p.on("close", onClose);
    popup.current = p;
    return () => {
      // switching to another event removes this pop-up; that must not clear the new selection
      p.off("close", onClose);
      popup.current = null;
      p.remove();
    };
  }, [map, lib, container, center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return event && container ? createPortal(<div className="w-64 text-neutral-900"><EventCard event={event} onRoute={() => popup.current?.remove()} /></div>, container) : null;
}
