"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
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
 */

/** bar: minimised to its header. compact: opened size. tall: pulled up. */
type SheetSize = "bar" | "compact" | "tall";
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
  const [size, setSize] = useState<SheetSize>("compact");
  const tall = size === "tall";
  const bar = size === "bar";
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<number | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [here, setHere] = useState<Here | null>(null);
  /** Bumped after joining, to load the counts and your activity again. */
  const [reload, setReload] = useState(0);

  // what is there: crowd level, live activities and planned events at this building (the parent
  // keys this component by place id, so a new building starts with fresh state)
  useEffect(() => {
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
      setHere({
        crowd: density?.places.find((p) => p.placeId === place.id) ?? null,
        activities: activities.filter((a) => a.placeId === place.id && a.status === "active"),
        events: events
          .filter((e) => e.placeId === place.id && new Date(e.endsAt).getTime() > now)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .slice(0, 5),
        me,
        loadedAt: now,
      });
    });
    return () => controller.abort();
  }, [place.id, reload]);

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

  // tapping the Map button in the tab bar minimises it to its bar, like a pull down
  useEffect(() => {
    const onTap = () => setSize("bar");
    window.addEventListener(MAP_TAB_TAPPED_EVENT, onTap);
    return () => window.removeEventListener(MAP_TAB_TAPPED_EVENT, onTap);
  }, []);

  // A pull down anywhere else on the open sheet minimises it, like one on the header, but only
  // when it starts with the list scrolled to the top: otherwise the list scrolls. Native
  // listeners: touchmove must be non-passive to stop the browser's own scroll and overscroll.
  useEffect(() => {
    const el = sheet.current;
    if (!el || size === "bar") return; // minimised, all that shows is the header
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
  }, [size]);

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

  const crowd = here?.crowd;
  const happening = (here?.activities.length ?? 0) + (here?.events.length ?? 0);

  return (
    <div
      ref={sheet}
      // pinned to the screen's bottom, so it would ride up above the keyboard: hide while typing
      data-hide-with-keyboard
      role="dialog"
      aria-label={place.name}
      style={{
        transform: drag && drag > 0 ? `translateY(${drag}px)` : undefined,
        transition: drag === null ? "transform 220ms ease, max-height 260ms cubic-bezier(.2,.8,.2,1)" : "none",
      }}
      className={`fixed inset-x-0 bottom-0 flex flex-col rounded-t-3xl bg-white text-ink shadow-[0_-8px_24px_rgba(21,50,67,0.25)] ${
        tall ? "h-[85dvh]" : bar ? "" : "max-h-[55dvh]"
      } pb-[calc(env(safe-area-inset-bottom)_+_5.25rem)]`}
    >
      <div
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
        className={`shrink-0 cursor-grab touch-none select-none px-4 pt-2 ${bar ? "pb-3" : "pb-2"}`}
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
        </div>
      </div>

      {bar ? null : (
        <>
          <div ref={content} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4">
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
        </>
      )}
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
