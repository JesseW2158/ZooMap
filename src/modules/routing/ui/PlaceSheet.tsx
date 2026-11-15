"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  ActivityList,
  ActivityMe,
  DensityResponse,
  PlannedEventList,
  type Activity,
  type ActivityMe as ActivityMeT,
  type DensityPlace,
  type Place,
  type PlannedEvent,
} from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { mapStore } from "@/shared/ui";
import { CheckIcon, GoIcon, PlusIcon } from "./icons";

/** Same words as the crowd panel (density/ui/levels.ts), which this module cannot import. */
const LEVEL_LABELS = ["Empty", "Quiet", "Moderate", "Busy", "Packed"] as const;
const LEVEL_DOT = ["bg-ash", "bg-[#7cc47f]", "bg-[#f2c94c]", "bg-[#f2994a]", "bg-[#d64545]"] as const;

const SWIPE_PX = 48;
/** The shell fires this on window when the Map tab button is tapped (src/app/_shell/AppShell.tsx). */
const MAP_TAB_TAPPED_EVENT = "zoomap:map-tab-tapped";
const TAP_PX = 6;

interface Here {
  crowd: DensityPlace | null;
  activities: Activity[];
  events: PlannedEvent[];
  /** The activity you are in, if any, for the Join / Switch buttons. */
  me: ActivityMeT | null;
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
 * be pulled up taller. A pull down (on the header, or anywhere on the sheet while its list is at
 * the top) minimises it to a bar with just the name; a second pull down closes it, and a pull up
 * or a tap brings it back. Tapping the Map tab button minimises it too. A tap on empty map also
 * closes it (no close button).
 *
 * Everything moves: it slides up when a building is chosen and down when closed (it stays
 * mounted below the screen, so closes from anywhere animate), its height eases between the
 * sizes (measured, since the compact size fits its content), and choosing another building while
 * it is open cross-fades the content.
 */

/** bar: minimised to its header. compact: opened size. tall: pulled up. */
type SheetSize = "bar" | "compact" | "tall";

/** The sheet's slide and resize. */
const SHEET_MS = 300;
const SHEET_EASE = "cubic-bezier(.2,.8,.2,1)";
/** Compact is at most this much of the screen, tall this much. */
const COMPACT_MAX = 0.55;
const TALL = 0.85;

export function PlaceSheet({
  place,
  categoryLabel,
  icon,
  onGo,
  onClose,
}: {
  /** The building to show, or null to slide the sheet away. */
  place: Place | null;
  categoryLabel: (place: Place) => string;
  icon: (place: Place) => ReactNode;
  onGo: (place: Place) => void;
  onClose: () => void;
}) {
  const open = place !== null;
  // the last building shown: it stays on the sheet while it slides away
  const [shown, setShown] = useState<Place | null>(place);
  const [size, setSize] = useState<SheetSize>("compact");
  if (place && place !== shown) {
    // another building opens at the compact size
    if (place.id !== shown?.id) setSize("compact");
    setShown(place);
  }
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSize("compact");
  }

  const tall = size === "tall";
  const bar = size === "bar";
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<number | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const contentInner = useRef<HTMLDivElement>(null);
  const goRow = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<(Here & { placeId: string }) | null>(null);
  const here = shown && data?.placeId === shown.id ? data : null;
  /** Bumped after joining, to load the counts and your activity again. */
  const [reload, setReload] = useState(0);
  /** The sheet's height for its size, in px (null until measured). */
  const [height, setHeight] = useState<number | null>(null);

  // what is there: crowd level, live activities and planned events at this building
  const placeId = open ? place.id : null;
  useEffect(() => {
    if (!placeId) return;
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      apiFetch("/api/density", { schema: DensityResponse, signal }).catch(() => null),
      apiFetch("/api/activities", { schema: ActivityList, signal }).catch(() => []),
      apiFetch("/api/planned-events", { schema: PlannedEventList, signal }).catch(() => []),
      apiFetch("/api/activities/me", { schema: ActivityMe, signal }).catch(() => null),
    ]).then(([density, activities, events, me]) => {
      if (signal.aborted) return;
      const now = Date.now();
      setData({
        placeId,
        crowd: density?.places.find((p) => p.placeId === placeId) ?? null,
        activities: activities.filter((a) => a.placeId === placeId && a.status === "active"),
        events: events
          .filter((e) => e.placeId === placeId && new Date(e.endsAt).getTime() > now)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .slice(0, 5),
        me,
        loadedAt: now,
      });
    });
    return () => controller.abort();
  }, [placeId, reload]);

  // Measure the height for the current size: the bar is the header; compact fits the content up
  // to COMPACT_MAX of the screen; tall is TALL of it. Kept current as the content loads or the
  // screen changes, and set before paint so a size change starts from where it is.
  useLayoutEffect(() => {
    const el = sheet.current;
    if (!el || !shown) return;
    const measure = () => {
      const screen = window.innerHeight;
      const padding = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      const header = handle.current?.offsetHeight ?? 0;
      const fit = header + (contentInner.current?.offsetHeight ?? 0) + (goRow.current?.offsetHeight ?? 0) + padding;
      const next =
        size === "bar" ? header + padding : size === "tall" ? Math.round(screen * TALL) : Math.min(fit, Math.round(screen * COMPACT_MAX));
      setHeight((h) => (h === next ? h : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (handle.current) observer.observe(handle.current);
    if (contentInner.current) observer.observe(contentInner.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [size, shown]);

  // A tap on empty map closes it; a tap on a building selects that one instead. The search (and
  // so this sheet) is rendered outside the map's React context, so watch the map canvas in the
  // DOM: from the finger going down until just after the click, any map-store update means the
  // campus layer selected a building; no update means the tap hit empty map. Drags send no click.
  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  // tapping the Map button in the tab bar minimises it to its bar, like a pull down
  useEffect(() => {
    if (!open) return;
    const onTap = () => setSize("bar");
    window.addEventListener(MAP_TAB_TAPPED_EVENT, onTap);
    return () => window.removeEventListener(MAP_TAB_TAPPED_EVENT, onTap);
  }, [open]);

  // A pull down anywhere else on the open sheet minimises it, like one on the header, but only
  // when it starts with the list scrolled to the top: otherwise the list scrolls. Native
  // listeners: touchmove must be non-passive to stop the browser's own scroll and overscroll.
  useEffect(() => {
    const el = sheet.current;
    if (!el || !open || size === "bar") return; // minimised, all that shows is the header
    let startY = 0;
    let armed = false;
    let pulling = false;
    let pulled = 0;
    const onStart = (e: TouchEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const inList = !!target && !!content.current?.contains(target);
      armed =
        e.touches.length === 1 &&
        !target?.closest("[data-sheet-handle]") && // the header has its own pointer handling
        (!inList || (content.current?.scrollTop ?? 0) <= 0);
      startY = e.touches[0]!.clientY;
      pulling = false;
      pulled = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!armed) return;
      const dy = e.touches[0]!.clientY - startY;
      if (!pulling) {
        if (dy < -TAP_PX) {
          armed = false; // an upward swipe: let the list scroll
          return;
        }
        if (dy <= TAP_PX) return;
        pulling = true;
        startY = e.touches[0]!.clientY; // start the drag from here, so the sheet does not jump
      }
      if (e.cancelable) e.preventDefault();
      pulled = Math.max(0, e.touches[0]!.clientY - startY);
      setDrag(pulled);
    };
    const onEnd = () => {
      if (!pulling) return;
      pulling = false;
      setDrag(null);
      if (pulled > SWIPE_PX) setSize("bar");
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [open, size]);

  // pull on the header: up makes it bigger (bar, compact, tall), down minimises it to the bar,
  // down again closes; a tap opens the bar, or toggles compact and tall
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
    if (Math.abs(dy) < TAP_PX) setSize(bar ? "compact" : tall ? "compact" : "tall");
    else if (dy < -SWIPE_PX) setSize(bar ? "compact" : "tall");
    else if (dy > SWIPE_PX) {
      if (bar) onClose();
      else setSize("bar");
    }
  };

  if (!shown) return null;
  const crowd = here?.crowd;
  const happening = (here?.activities.length ?? 0) + (here?.events.length ?? 0);
  const dragging = drag !== null;
  const offset = open ? (drag && drag > 0 ? `${drag}px` : "0px") : "100%";

  return (
    <div
      ref={sheet}
      // pinned to the screen's bottom, so it would ride up above the keyboard: hide while typing
      data-hide-with-keyboard
      role="dialog"
      aria-label={shown.name}
      aria-hidden={open ? undefined : true}
      inert={!open}
      style={{
        height: height ?? undefined,
        transform: `translateY(${offset})`,
        // closed, it waits below the screen; hide it once there so its shadow doesn't peek up
        visibility: open ? "visible" : "hidden",
        transition: dragging
          ? "none"
          : `transform ${SHEET_MS}ms ${SHEET_EASE}, height ${SHEET_MS}ms ${SHEET_EASE}, visibility 0s linear ${open ? "0s" : `${SHEET_MS}ms`}`,
        // the first time it appears it slides up from below the screen
        animation: `zm-sheet-in ${SHEET_MS}ms ${SHEET_EASE}`,
      }}
      className="fixed inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-3xl bg-white text-ink shadow-[0_-8px_24px_rgba(21,50,67,0.25)] pb-[calc(env(safe-area-inset-bottom)_+_5.25rem)]"
    >
      <div
        ref={handle}
        role="button"
        tabIndex={0}
        data-sheet-handle
        aria-expanded={!bar}
        aria-label={tall ? "Show less" : "Show more"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSize(bar || tall ? "compact" : "tall");
          } else if (e.key === "Escape") onClose();
        }}
        className="shrink-0 cursor-grab touch-none select-none px-4 pb-3 pt-2"
      >
        <div aria-hidden className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-ash" />
        {/* keyed by building, so choosing another one cross-fades the header */}
        <div key={shown.id} className="animate-fade flex items-center gap-3">
          <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-linen text-ink">
            {icon(shown)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{shown.name}</h2>
            <p className="truncate text-xs text-yale">
              {categoryLabel(shown)}
              {shown.studyFriendly ? " · good for studying" : ""}
              {shown.aliases.length ? ` · ${shown.aliases.slice(0, 3).join(", ")}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* minimised, the rest stays (so the height can ease) but fades and drops out of reach */}
      <div
        ref={content}
        inert={bar}
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 transition-opacity duration-200 ${bar ? "opacity-0" : "opacity-100"}`}
      >
        <div ref={contentInner} key={shown.id} className="animate-fade space-y-3">
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
                <ActivityRow key={a.id} activity={a} me={here.me} onJoined={() => setReload((n) => n + 1)} />
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
      </div>

      <div
        ref={goRow}
        inert={bar}
        className={`shrink-0 px-4 pt-3 transition-opacity duration-200 ${bar ? "opacity-0" : "opacity-100"}`}
      >
        <button
          type="button"
          onClick={() => onGo(shown)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-4 py-3 text-base font-semibold text-ivory shadow-sm hover:bg-yale"
        >
          <GoIcon className="h-5 w-5" />
          Go
        </button>
      </div>
    </div>
  );
}

/**
 * A live activity at this building, with a button to join it: "Join", or "Switch" when you are
 * in another activity (leaves that one, then joins this). Switching away from one you host ends
 * it for everyone, so that asks for a second tap. The one you are in shows "You're in".
 */
function ActivityRow({ activity: a, me, onJoined }: { activity: Activity; me: ActivityMeT | null; onJoined: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = me?.participation?.status === "active" ? me.participation : null;
  const mine = current?.activityId === a.id;
  const switching = !!current && !mine;
  const hosting = switching && current.role === "host";
  const full = a.capacity !== undefined && a.participantCount >= a.capacity;
  const currentTitle = me?.activity?.title;

  const join = async () => {
    if (hosting && !confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (current && switching) await apiFetch(`/api/activities/${current.activityId}/leave`, { method: "POST" });
      await apiFetch(`/api/activities/${a.id}/join`, { method: "POST" });
      onJoined();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Couldn't join. Try again.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <li className="rounded-xl bg-linen px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{a.title}</span>
          <span className="block text-xs text-yale">
            Live · {a.participantCount}
            {a.capacity ? `/${a.capacity}` : ""} here
          </span>
        </span>
        {mine ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-ink">
            <CheckIcon className="h-3.5 w-3.5" />
            You&apos;re in
          </span>
        ) : full ? (
          <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-yale">Full</span>
        ) : (
          <button
            type="button"
            onClick={join}
            disabled={busy}
            className="flex shrink-0 items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-ivory hover:bg-yale disabled:opacity-60"
          >
            {switching ? null : <PlusIcon className="h-3.5 w-3.5" />}
            {busy ? "Joining…" : confirming ? "Confirm" : switching ? "Switch" : "Join"}
          </button>
        )}
      </div>
      {switching && !full ? (
        <p className="mt-1 text-xs text-yale">
          {confirming
            ? `You're hosting ${currentTitle ? `"${currentTitle}"` : "an activity"}: switching ends it for everyone. Tap Confirm to switch.`
            : `Leaves ${currentTitle ? `"${currentTitle}"` : "your current activity"} and joins this one.`}
        </p>
      ) : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </li>
  );
}
