import type { Map as MapLibreMap, Popup } from "maplibre-gl";

/**
 * A small tooltip on the map for hovering an icon: a bold title, one line of detail and a
 * short description. It never takes the pointer, so it cannot flicker the icon underneath.
 * One tip per map; showing another replaces it.
 */

export interface TipContent {
  title: string;
  /** One line under the title, such as "Today 7pm · Mullins Center". */
  meta?: string;
  /** The description; long ones are cut. */
  body?: string;
}

const MAX_BODY = 160;

interface Tip {
  priority: number;
  key?: string;
  popup: Popup | null;
}
const tips = new WeakMap<MapLibreMap, Tip>();

/**
 * Hide the tip, unless a more important one is showing. A building's name has priority 0 and
 * an icon's tip priority 1, so the building tip never covers or replaces an icon's.
 */
export function hideTip(map: MapLibreMap, priority = Infinity): void {
  const tip = tips.get(map);
  if (!tip || tip.priority > priority) return;
  tip.popup?.remove();
  tips.delete(map);
}

export interface ShowTipOptions {
  /** Higher wins; a lower one is ignored while a higher one shows. Default 1. */
  priority?: number;
  /** The same key as the tip already showing only moves it, so following the pointer is cheap. */
  key?: string;
}

/** `offset` is how far above the point, in pixels, the tip sits (the icon's height). */
export async function showTip(
  map: MapLibreMap,
  at: { lat: number; lng: number },
  content: TipContent,
  offset = 16,
  opts: ShowTipOptions = {},
): Promise<void> {
  const priority = opts.priority ?? 1;
  const current = tips.get(map);
  if (current && current.priority > priority) return;
  if (current && opts.key !== undefined && current.key === opts.key) {
    current.popup?.setLngLat([at.lng, at.lat]);
    return;
  }
  hideTip(map);
  const tip: Tip = { priority, key: opts.key, popup: null };
  tips.set(map, tip);
  const { Popup } = await import("maplibre-gl");
  if (tips.get(map) !== tip) return; // the pointer already left, or a more important tip took over

  const el = document.createElement("div");
  el.className = "max-w-56 text-left text-neutral-900";
  const title = document.createElement("p");
  title.className = "text-sm font-semibold leading-snug";
  title.textContent = content.title;
  el.append(title);
  if (content.meta) {
    const meta = document.createElement("p");
    meta.className = "mt-0.5 text-xs text-neutral-600";
    meta.textContent = content.meta;
    el.append(meta);
  }
  const text = content.body?.trim();
  if (text) {
    const body = document.createElement("p");
    body.className = "mt-1 text-xs leading-snug text-neutral-800";
    body.textContent = text.length > MAX_BODY ? `${text.slice(0, MAX_BODY - 1).trimEnd()}…` : text;
    el.append(body);
  }

  const popup = new Popup({ closeButton: false, closeOnClick: false, closeOnMove: false, anchor: "bottom", offset: [0, -offset], maxWidth: "240px", className: "hover-tip" })
    .setLngLat([at.lng, at.lat])
    .setDOMContent(el)
    .addTo(map);
  popup.getElement().style.pointerEvents = "none";
  tip.popup = popup;
}
