"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Popup } from "maplibre-gl";
import type { PlannedEvent } from "@/shared/contracts";
import { isDevPickingNow } from "@/shared/platform";
import { createPinLayer, pinTopM, screenHeightPx, useMap, type PinLayer, type PinSpec } from "@/shared/ui";
import { usePlannedFeed, usePlannedPoller } from "./feed";
import { EventCard } from "./Panel";

/**
 * Planned events on the map: a 3D pin standing on the place for each event in the next week
 * (the map has no text glyphs, so colour and size carry the meaning: maroon if you are going,
 * amber and taller for a big event, slate otherwise). Tapping one opens the same card as the
 * Events tab, with "I'm going" and a route. Also owns the events poller, since the layer is
 * always mounted.
 */

const WEEK_MS = 7 * 24 * 3_600_000;
type MapLibre = typeof import("maplibre-gl");

const PIN_GOING = "#881c1c";
const PIN_BIG = "#f59e0b";
const PIN_PLAIN = "#475569";
/** Planned pins stand a little south of a place's centre, so an activity pin there stays visible. */
const SOUTH_M = -14;

function pinFor(e: PlannedEvent): PinSpec {
  return {
    id: e.id,
    at: e.placeCenter!,
    color: e.going ? PIN_GOING : e.big ? PIN_BIG : PIN_PLAIN,
    scale: e.big ? 1.25 : 1,
    dyM: SOUTH_M,
  };
}

export function PlannedEventsLayer() {
  usePlannedPoller();
  const map = useMap();
  const { events } = usePlannedFeed();
  const [lib, setLib] = useState<MapLibre | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // the pop-up's content is a React portal into this element (created only in the browser)
  const [container] = useState(() => (typeof document === "undefined" ? null : document.createElement("div")));
  const pins = useRef<PinLayer | null>(null);
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

  // the 3D pin layer lives as long as the map
  useEffect(() => {
    if (!map) return;
    const layer = createPinLayer(map, "planned", (props) => {
      if (!isDevPickingNow() && typeof props.id === "string") setSelected(props.id);
    });
    pins.current = layer;
    return () => {
      layer.remove();
      pins.current = null;
    };
  }, [map]);

  // one pin per event in the next week
  useEffect(() => {
    const now = Date.now();
    const shown = (events ?? []).filter((e) => e.placeCenter && new Date(e.startsAt).getTime() <= now + WEEK_MS);
    pins.current?.setPins(shown.map(pinFor));
  }, [map, events]);

  const event = events?.find((e) => e.id === selected) ?? null;
  const center = event?.placeCenter;
  const selectedScale = event?.big ? 1.25 : 1;

  // the pop-up follows the selected event
  useEffect(() => {
    if (!map || !lib || !container || !center) return;
    // the pop-up sits on the pin's head, which is a height in metres, so its pixel offset follows zoom and pitch
    const headPx = () => screenHeightPx(map, pinTopM(selectedScale) + 4);
    const p = new lib.Popup({ closeButton: true, closeOnClick: true, maxWidth: "300px", anchor: "bottom", offset: [0, -headPx()], className: "planned-popup" })
      .setLngLat([center.lng, center.lat + SOUTH_M / 111_320])
      .setDOMContent(container)
      .addTo(map);
    const follow = () => p.setOffset([0, -headPx()]);
    map.on("zoom", follow);
    map.on("pitch", follow);
    const onClose = () => setSelected(null);
    p.on("close", onClose);
    popup.current = p;
    return () => {
      // switching to another event removes this pop-up; that must not clear the new selection
      p.off("close", onClose);
      map.off("zoom", follow);
      map.off("pitch", follow);
      popup.current = null;
      p.remove();
    };
  }, [map, lib, container, center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return event && container ? createPortal(<div className="w-64 text-neutral-900"><EventCard event={event} onRoute={() => popup.current?.remove()} /></div>, container) : null;
}
