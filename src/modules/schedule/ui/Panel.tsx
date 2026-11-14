"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Place, RouteResult, ScheduleConnection, ScheduleEvent, Weekday } from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { openExternalAuth, useUserLocation } from "@/shared/platform";
import { useApi, useMapStore } from "@/shared/ui";

/**
 * The Schedule tab is a day planner: classes, plans in between ("Study at Du Bois"), and the
 * walk between each pair, each previewable on the map. The free gaps are where the recommend
 * module (Gemini) will later suggest study spots; today the user fills them by hand.
 */

const TZ = "America/New_York";
const DAY_MS = 86_400_000;
/** Leave this much earlier than the walk alone needs. */
const BUFFER_MIN = 2;
/** A gap at least this long offers "Plan something here". */
const GAP_MIN = 30;

const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const hhmmFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
const chipFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", day: "numeric" });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const utcDayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const utcDayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" });

const fmtTime = (d: string | number | Date) => timeFmt.format(new Date(d)).replace(" ", "").toLowerCase();
const toHHMM = (d: string | number | Date) => hhmmFmt.format(new Date(d));
/** Campus-local date key; all-day events are dated in UTC (see the contract). */
const dayKey = (e: ScheduleEvent) => (e.allDay ? utcDayKeyFmt : dayKeyFmt).format(new Date(e.start));
const minutes = (ms: number) => Math.round(ms / 60_000);

const STATUS_MESSAGES: Record<string, string> = {
  "google-connected": "Google Calendar connected.",
  "google-denied": "Google Calendar was not connected: access was not granted.",
  "google-error": "Google Calendar could not be connected. Try again.",
  "google-unavailable": "Google Calendar is not set up on this server yet. Add classes by hand or paste a Canvas link.",
};

type Adding = null | { kind: "plan"; date?: string; start?: string; end?: string } | { kind: "class" } | { kind: "canvas" };

// ---------------------------------------------------------------- walking times between places

const walkCache = new Map<string, number>();
/** Minutes to walk from one place to another (or from a position), cached per pair. */
function useWalkMinutes(toPlaceId: string | undefined, from: { placeId?: string; lat?: number; lng?: number } | null): number | null | "error" {
  const key = toPlaceId && from ? `${from.placeId ?? `${from.lat?.toFixed(3)},${from.lng?.toFixed(3)}`}>${toPlaceId}` : null;
  const [result, setResult] = useState<{ key: string; value: number | "error" } | null>(null);
  useEffect(() => {
    if (!key || !toPlaceId || !from || walkCache.has(key)) return;
    const controller = new AbortController();
    const q = new URLSearchParams({ to: toPlaceId });
    if (from.placeId) q.set("fromPlaceId", from.placeId);
    else { q.set("fromLat", String(from.lat)); q.set("fromLng", String(from.lng)); }
    apiFetch<RouteResult>(`/api/route?${q}`, { signal: controller.signal })
      .then((r) => { const m = Math.max(1, minutes(r.durationS * 1000)); walkCache.set(key, m); setResult({ key, value: m }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ key, value: "error" }); });
    return () => controller.abort();
    // `from` is captured through `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, toPlaceId]);
  if (!key) return null;
  if (walkCache.has(key)) return walkCache.get(key)!;
  return result?.key === key ? result.value : null;
}

// ---------------------------------------------------------------- panel

export function SchedulePanel() {
  const [range] = useState(() => {
    const now = Date.now();
    return { from: new Date(now - 18 * 3600_000).toISOString(), to: new Date(now + 8 * DAY_MS).toISOString() };
  });
  const events = useApi<ScheduleEvent[]>(`/api/schedule/events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`, { pollMs: 5 * 60_000 });
  const connections = useApi<ScheduleConnection[]>("/api/schedule/connections");
  const [adding, setAdding] = useState<Adding>(null);
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState(() => {
    if (typeof window === "undefined") return null;
    const flag = new URLSearchParams(window.location.search).get("schedule");
    return flag ? (STATUS_MESSAGES[flag] ?? null) : null;
  });
  const refresh = () => { events.refresh(); connections.refresh(); };

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayKeyFmt.format(new Date(now + i * DAY_MS))), [now]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const day = selectedDay && days.includes(selectedDay) ? selectedDay : days[0];

  const all = useMemo(() => events.data ?? [], [events.data]);
  const timed = all.filter((e) => !e.deadline && !e.allDay);
  const items = timed.filter((e) => dayKey(e) === day);
  const next = timed.find((e) => !e.skipped && new Date(e.end).getTime() > now);
  const due = all.filter((e) => e.deadline && (e.allDay ? dayKey(e) >= days[0] : new Date(e.start).getTime() >= now)).slice(0, 8);
  const conns = connections.data ?? [];

  if (connections.loading && !connections.data) return <p className="p-4 text-sm text-neutral-500">Loading your schedule…</p>;
  if (connections.error?.code === "UNAUTHORIZED") return <p className="p-4 text-sm text-neutral-600">Sign in to see your schedule.</p>;

  const finish = (saved: boolean, message?: string) => {
    setAdding(null);
    if (saved) { refresh(); if (message) setNotice(message); }
  };

  return (
    <div className="space-y-4 p-4 text-neutral-900">
      {notice ? (
        <p className="flex items-start justify-between gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <span>{notice}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="text-blue-400 hover:text-blue-700">✕</button>
        </p>
      ) : null}

      {adding?.kind === "plan" ? <PlanForm initial={adding} onDone={(s) => finish(s, "Plan added.")} /> : null}
      {adding?.kind === "class" ? <AddClassForm onDone={(s) => finish(s, "Class added.")} /> : null}
      {adding?.kind === "canvas" ? <AddFeedForm onDone={(s) => finish(s, "Canvas link added. Deadlines show under Due soon.")} /> : null}

      {!adding && conns.length === 0 ? <ConnectScreen onPick={setAdding} /> : null}

      {!adding && conns.length > 0 ? (
        <>
          {next ? <NextUp event={next} previous={previousPlaced(timed, next)} now={now} /> : null}

          {/* day chips and the one add button */}
          <div className="flex items-center gap-2">
            <div role="tablist" aria-label="Day" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
              {days.map((d, i) => (
                <button
                  key={d}
                  role="tab"
                  type="button"
                  aria-selected={d === day}
                  onClick={() => setSelectedDay(d)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${d === day ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
                >
                  {i === 0 ? "Today" : i === 1 ? "Tomorrow" : chipFmt.format(new Date(now + i * DAY_MS))}
                </button>
              ))}
            </div>
            <div className="relative shrink-0">
              <button
                type="button"
                aria-expanded={menu}
                onClick={() => setMenu((m) => !m)}
                className="rounded-full bg-[#881c1c] px-3 py-1 text-xs font-semibold text-white hover:bg-[#6f1616]"
              >
                + Add
              </button>
              {menu ? (
                <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-neutral-200 bg-white text-sm shadow-lg" onClick={() => setMenu(false)}>
                  <MenuItem title="Plan" hint="Study, meet a friend, eat: one time" onClick={() => setAdding({ kind: "plan", date: day })} />
                  <MenuItem title="Class" hint="Repeats every week" onClick={() => setAdding({ kind: "class" })} />
                  <MenuItem title="Canvas deadlines" hint="Paste your Canvas calendar link" onClick={() => setAdding({ kind: "canvas" })} />
                  {!conns.some((c) => c.provider === "google") ? (
                    <MenuItem title="Google Calendar" hint="Read-only" onClick={() => openExternalAuth("/api/schedule/google/connect")} />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <DayTimeline
            items={items}
            date={day}
            now={now}
            onAddPlan={(start, end) => setAdding({ kind: "plan", date: day, start, end })}
            onChanged={refresh}
          />

          {due.length ? (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Due soon</h3>
              <ul className="divide-y divide-neutral-100">
                {due.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-3 py-1.5 text-sm">
                    <span className="w-24 shrink-0 text-xs text-neutral-500">
                      {dayKey(e) === days[0] ? "Today" : (e.allDay ? utcDayFmt : dayFmt).format(new Date(e.start))}
                      {e.allDay ? "" : ` ${fmtTime(e.start)}`}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{e.title}</span>
                    {e.course ? <span className="shrink-0 text-xs text-neutral-400">{e.course}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <Calendars connections={conns} onChanged={refresh} />
          {events.error ? <p className="text-xs text-red-700">Could not load events: {events.error.message}</p> : null}
        </>
      ) : null}
    </div>
  );
}

function MenuItem({ title, hint, onClick }: { title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block w-full px-3 py-2 text-left hover:bg-neutral-50">
      <span className="block font-medium text-neutral-900">{title}</span>
      <span className="block text-xs text-neutral-500">{hint}</span>
    </button>
  );
}

/** The last non-skipped item with a place that ends before `e` starts, on the same day. */
function previousPlaced(list: ScheduleEvent[], e: ScheduleEvent): ScheduleEvent | undefined {
  const day = dayKey(e);
  return [...list].reverse().find((x) => x !== e && !x.skipped && x.placeId && dayKey(x) === day && x.end <= e.start);
}

function ConnectScreen({ onPick }: { onPick: (a: Adding) => void }) {
  const card = "w-full rounded-xl border border-neutral-200 p-3 text-left hover:bg-neutral-50";
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-700">Plan your day: classes, study time in between, and how to walk there.</p>
      <button type="button" onClick={() => onPick({ kind: "class" })} className={card}>
        <div className="text-sm font-semibold">Add a class</div>
        <div className="text-xs text-neutral-500">Course, building, days and time, from your SPIRE schedule.</div>
      </button>
      <button type="button" onClick={() => onPick({ kind: "plan" })} className={card}>
        <div className="text-sm font-semibold">Add a plan</div>
        <div className="text-xs text-neutral-500">“Study at Du Bois, 2–3pm”: something you do once.</div>
      </button>
      <button type="button" onClick={() => openExternalAuth("/api/schedule/google/connect")} className={card}>
        <div className="text-sm font-semibold">Connect Google Calendar</div>
        <div className="text-xs text-neutral-500">If your classes are in Google Calendar. Read-only.</div>
      </button>
      <button type="button" onClick={() => onPick({ kind: "canvas" })} className={card}>
        <div className="text-sm font-semibold">Add Canvas deadlines</div>
        <div className="text-xs text-neutral-500">Paste your Canvas calendar feed link to see what is due.</div>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- next up

function NextUp({ event, previous, now }: { event: ScheduleEvent; previous?: ScheduleEvent; now: number }) {
  const { requestRoute, selectPlace } = useMapStore();
  const { position, start: startLocation, status } = useUserLocation();
  const walk = useWalkMinutes(event.placeId, position ? { lat: position.lat, lng: position.lng } : null);

  const start = new Date(event.start).getTime();
  const inProgress = start <= now;
  const leaveBy = typeof walk === "number" ? start - (walk + BUFFER_MIN) * 60_000 : null;
  const minsToLeave = leaveBy !== null ? minutes(leaveBy - now) : null;
  const sameDay = dayKeyFmt.format(new Date(start)) === dayKeyFmt.format(new Date(now));

  return (
    <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-[#881c1c]">{inProgress ? "Now" : "Next up"}</div>
      <div className="mt-0.5 text-base font-semibold">{event.title}</div>
      <div className="text-sm text-neutral-600">
        {sameDay ? "" : `${dayFmt.format(new Date(start))}, `}
        {fmtTime(event.start)}–{fmtTime(event.end)}
        {event.locationText ? ` · ${event.locationText}` : ""}
      </div>

      {!inProgress && event.placeId ? (
        <div className="mt-2 text-sm">
          {typeof walk === "number" && leaveBy !== null ? (
            <p>
              <span className="font-semibold">Leave by {fmtTime(leaveBy)}</span>
              <span className="text-neutral-600">
                {" "}· {walk} min walk from you
                {minsToLeave !== null && minsToLeave >= 0 && minsToLeave < 120 ? ` · in ${minsToLeave} min` : ""}
                {minsToLeave !== null && minsToLeave < 0 ? " · go now" : ""}
              </span>
            </p>
          ) : walk === "error" ? (
            <p className="text-neutral-500">No walking time from where you are (off campus?).</p>
          ) : position ? (
            <p className="text-neutral-500">Working out the walk…</p>
          ) : status === "denied" || status === "unavailable" ? (
            <p className="text-neutral-500">Location is off, so no walking time from you.</p>
          ) : (
            <button type="button" onClick={startLocation} className="text-sm font-medium text-[#1663d6] hover:underline">
              {status === "requesting" ? "Finding you…" : "Use my location for the leave-by time"}
            </button>
          )}
        </div>
      ) : null}

      {event.placeId ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { selectPlace(event.placeId!); requestRoute(event.placeId!); }}
            className="rounded-full bg-[#881c1c] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#6f1616]"
          >
            Go from here
          </button>
          {previous?.placeId && previous.placeId !== event.placeId ? (
            <button
              type="button"
              onClick={() => { selectPlace(event.placeId!); requestRoute(event.placeId!, { fromPlaceId: previous.placeId }); }}
              className="rounded-full border border-neutral-300 bg-white px-4 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
            >
              Preview from {previous.locationText?.split(" ")[0] ?? previous.title}
            </button>
          ) : null}
        </div>
      ) : event.locationText ? (
        <p className="mt-1 text-xs text-neutral-500">Could not place “{event.locationText}” on the map.</p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- the day

function DayTimeline(props: { items: ScheduleEvent[]; date: string; now: number; onAddPlan: (start: string, end: string) => void; onChanged: () => void }) {
  const { items, now } = props;
  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-600">
        Nothing planned this day.{" "}
        <button type="button" onClick={() => props.onAddPlan("14:00", "15:00")} className="font-medium text-[#881c1c] hover:underline">
          + Add a plan
        </button>
      </div>
    );
  }
  const rows: ReactNode[] = [];
  let prev: ScheduleEvent | undefined;
  for (const item of items) {
    if (prev && !item.skipped) {
      rows.push(<Between key={`gap-${item.id}`} from={prev} to={item} now={now} onAddPlan={props.onAddPlan} />);
    }
    rows.push(<ItemCard key={item.id} event={item} past={new Date(item.end).getTime() < now} onChanged={props.onChanged} />);
    if (!item.skipped) prev = item;
  }
  return <ol className="space-y-0">{rows}</ol>;
}

/** The walk between two items, with Preview, and a "plan something here" offer when the gap is long. */
function Between({ from, to, now, onAddPlan }: { from: ScheduleEvent; to: ScheduleEvent; now: number; onAddPlan: (start: string, end: string) => void }) {
  const { requestRoute, selectPlace } = useMapStore();
  const canWalk = !!from.placeId && !!to.placeId && from.placeId !== to.placeId;
  const walk = useWalkMinutes(canWalk ? to.placeId : undefined, canWalk ? { placeId: from.placeId } : null);
  const gap = minutes(new Date(to.start).getTime() - new Date(from.end).getTime());
  const walkMin = typeof walk === "number" ? walk : 0;
  const free = gap - walkMin;
  const tight = canWalk && typeof walk === "number" && gap < walk + BUFFER_MIN;
  const past = new Date(to.start).getTime() < now;

  return (
    <li className="ml-[3.25rem] border-l-2 border-dotted border-neutral-300 py-1.5 pl-3 text-xs text-neutral-600">
      {canWalk ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span aria-hidden>🚶</span>
          <span>
            {typeof walk === "number" ? `${walk} min walk` : walk === "error" ? "No walking route" : "Walk…"}
            {" "}· {short(from)} → {short(to)}
          </span>
          {tight ? <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">tight: {gap} min between</span> : null}
          <button
            type="button"
            onClick={() => { selectPlace(to.placeId!); requestRoute(to.placeId!, { fromPlaceId: from.placeId }); }}
            className="rounded-full border border-neutral-300 bg-white px-2.5 py-0.5 font-medium text-[#1663d6] hover:bg-blue-50"
          >
            Preview
          </button>
        </div>
      ) : null}
      {!past && free >= GAP_MIN ? (
        <button
          type="button"
          onClick={() => onAddPlan(toHHMM(from.end), toHHMM(new Date(to.start).getTime() - walkMin * 60_000))}
          className="mt-1 rounded-full border border-dashed border-[#881c1c]/50 px-2.5 py-0.5 font-medium text-[#881c1c] hover:bg-red-50"
        >
          + Plan something here · {free >= 90 ? `${Math.floor(free / 60)} h ${free % 60 ? `${free % 60} min` : ""}` : `${free} min`} free
        </button>
      ) : null}
    </li>
  );
}

const short = (e: ScheduleEvent) => e.locationText?.split(" ").slice(0, 2).join(" ") ?? e.title;

function ItemCard({ event, past, onChanged }: { event: ScheduleEvent; past: boolean; onChanged: () => void }) {
  const { requestRoute, selectPlace } = useMapStore();
  const [mode, setMode] = useState<null | "confirm-delete" | "move">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPlan = event.source === "plan";

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); setMode(null); onChanged(); }
    catch (err) { setError(err instanceof ApiClientError ? err.message : "That did not work"); }
    finally { setBusy(false); }
  };
  const setSkipped = (skipped: boolean) =>
    act(() => apiFetch("/api/schedule/connections", { method: "PUT", body: { id: event.connectionId, skip: { eventId: event.id, skipped } } }));
  const remove = () => act(() => apiFetch(`/api/schedule/connections?id=${encodeURIComponent(event.connectionId!)}`, { method: "DELETE" }));

  const badge = isPlan ? "Plan" : event.source === "manual" ? "Class" : event.source === "google" ? "Google" : "Calendar";
  const small = "rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-xs font-medium hover:bg-neutral-100";

  return (
    <li className={`flex gap-3 rounded-xl border p-2.5 ${event.skipped ? "border-dashed border-neutral-200 bg-white" : isPlan ? "border-[#881c1c]/30 bg-red-50/40" : "border-neutral-200 bg-white"} ${past && !event.skipped ? "opacity-60" : ""}`}>
      <div className="w-[2.75rem] shrink-0 text-right text-xs tabular-nums text-neutral-600">
        <div className="font-semibold text-neutral-900">{fmtTime(event.start)}</div>
        <div>{fmtTime(event.end)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`truncate text-sm font-semibold ${event.skipped ? "text-neutral-400 line-through" : ""}`}>{event.title}</span>
          <span className={`shrink-0 rounded px-1.5 text-[10px] font-semibold uppercase ${isPlan ? "bg-[#881c1c] text-white" : "bg-neutral-100 text-neutral-500"}`}>{badge}</span>
        </div>
        {event.locationText ? <div className="truncate text-xs text-neutral-500">{event.locationText}</div> : null}

        {mode === "move" && isPlan ? (
          <MovePlan event={event} busy={busy} onCancel={() => setMode(null)} onSave={(start, end) => act(() => apiFetch("/api/schedule/connections", { method: "PUT", body: { id: event.connectionId, plan: { start, end } } }))} />
        ) : mode === "confirm-delete" ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-neutral-700">Delete this plan?</span>
            <button type="button" disabled={busy} onClick={remove} className="rounded-full bg-red-700 px-2.5 py-0.5 font-medium text-white">Delete</button>
            <button type="button" onClick={() => setMode(null)} className={small}>Keep</button>
          </div>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {event.skipped ? (
              <>
                <span className="text-xs text-neutral-500">Skipped</span>
                <button type="button" disabled={busy} onClick={() => setSkipped(false)} className={`${small} text-[#1663d6]`}>Undo</button>
              </>
            ) : (
              <>
                {event.placeId && !past ? (
                  <button type="button" onClick={() => { selectPlace(event.placeId!); requestRoute(event.placeId!); }} className={`${small} text-[#881c1c]`}>Go</button>
                ) : null}
                {event.placeId ? (
                  <button type="button" onClick={() => selectPlace(event.placeId!)} className={small}>Show</button>
                ) : null}
                {isPlan ? (
                  <>
                    <button type="button" onClick={() => setMode("move")} className={small}>Move</button>
                    <button type="button" onClick={() => setMode("confirm-delete")} className={`${small} text-red-700`}>Delete</button>
                  </>
                ) : event.connectionId && !past ? (
                  <button type="button" disabled={busy} onClick={() => setSkipped(true)} className={small} title="Skip just this one; the class stays on other days">Skip this one</button>
                ) : null}
              </>
            )}
          </div>
        )}
        {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
      </div>
    </li>
  );
}

function MovePlan({ event, busy, onSave, onCancel }: { event: ScheduleEvent; busy: boolean; onSave: (start: string, end: string) => void; onCancel: () => void }) {
  const [start, setStart] = useState(toHHMM(event.start));
  const [end, setEnd] = useState(toHHMM(event.end));
  const shift = (mins: number) => {
    const s = new Date(event.start).getTime() + mins * 60_000;
    const e = new Date(event.end).getTime() + mins * 60_000;
    setStart(toHHMM(s)); setEnd(toHHMM(e));
  };
  const input = "rounded-lg border border-neutral-200 bg-white px-2 py-0.5 text-xs text-neutral-900";
  return (
    <div className="mt-1.5 space-y-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => shift(-30)} className="rounded-full border border-neutral-200 px-2 py-0.5">−30 min</button>
        <button type="button" onClick={() => shift(30)} className="rounded-full border border-neutral-200 px-2 py-0.5">+30 min</button>
        <input type="time" aria-label="Start" value={start} onChange={(e) => setStart(e.target.value)} className={input} />
        <span>to</span>
        <input type="time" aria-label="End" value={end} onChange={(e) => setEnd(e.target.value)} className={input} />
      </div>
      <div className="flex gap-1.5">
        <button type="button" disabled={busy || end <= start} onClick={() => onSave(start, end)} className="rounded-full bg-neutral-900 px-2.5 py-0.5 font-medium text-white disabled:opacity-50">Save</button>
        <button type="button" onClick={onCancel} className="rounded-full border border-neutral-200 px-2.5 py-0.5">Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- calendars

function Calendars({ connections, onChanged }: { connections: ScheduleConnection[]; onChanged: () => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const remove = async (id: string) => {
    setBusy(id);
    try {
      await apiFetch(`/api/schedule/connections?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(null); setConfirm(null);
    }
  };
  const kind = (c: ScheduleConnection) => (c.provider === "manual" ? "Class" : c.provider === "plan" ? "Plan" : c.provider === "google" ? "Google" : "Feed");
  return (
    <details className="rounded-xl border border-neutral-200">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-neutral-700">My classes, plans and calendars ({connections.length})</summary>
      <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
        {connections.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="w-12 shrink-0 text-[10px] font-semibold uppercase text-neutral-400">{kind(c)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{c.label}</span>
              <span className="block truncate text-xs text-neutral-500">{c.summary}</span>
              {c.lastError ? <span className="block text-xs text-red-700">{c.lastError}</span> : null}
            </span>
            {confirm === c.id ? (
              <span className="flex shrink-0 gap-1">
                <button type="button" disabled={busy === c.id} onClick={() => remove(c.id)} className="rounded-full bg-red-700 px-2.5 py-0.5 text-xs font-medium text-white">
                  {c.provider === "manual" ? "Remove every week" : "Remove"}
                </button>
                <button type="button" onClick={() => setConfirm(null)} className="rounded-full border border-neutral-200 px-2.5 py-0.5 text-xs">Keep</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirm(c.id)} className="shrink-0 rounded-full border border-neutral-200 px-2.5 py-0.5 text-xs text-neutral-600 hover:text-red-700">
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------- forms

const inputCls = "w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400";

function BuildingPicker({ place, onPick, placeholder }: { place: Place | null; onPick: (p: Place | null) => void; placeholder: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  useEffect(() => {
    if (!q.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch<Place[]>(`/api/places?q=${encodeURIComponent(q.trim())}`, { signal: controller.signal }).then(setResults).catch(() => {});
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q]);
  return (
    <div className="relative">
      {place ? (
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm">
          <span>{place.name}</span>
          <button type="button" className="text-xs text-neutral-500 hover:underline" onClick={() => { onPick(null); setQ(""); }}>change</button>
        </div>
      ) : (
        <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      )}
      {!place && q.trim() && results.length ? (
        <ul className="absolute left-0 right-0 z-10 mt-1 max-h-40 overflow-auto rounded-lg border border-neutral-200 bg-white shadow">
          {results.slice(0, 6).map((p) => (
            <li key={p.id}>
              <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-100" onClick={() => { onPick(p); setResults([]); }}>
                {p.name}
                {p.studyFriendly ? <span className="ml-1 text-xs text-emerald-700">· good for studying</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const PLAN_PRESETS = ["Study", "Group study", "Lunch", "Office hours", "Gym"];

function PlanForm({ initial, onDone }: { initial: { date?: string; start?: string; end?: string }; onDone: (saved: boolean) => void }) {
  const today = dayKeyFmt.format(new Date());
  const [label, setLabel] = useState("Study");
  const [place, setPlace] = useState<Place | null>(null);
  const [date, setDate] = useState(initial.date ?? today);
  const [start, setStart] = useState(initial.start ?? "14:00");
  const [end, setEnd] = useState(initial.end ?? "15:00");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);
    if (!label.trim()) return setError("Give the plan a name.");
    if (end <= start) return setError("The end time must be after the start.");
    setSaving(true);
    try {
      const title = place && /^(study|group study)$/i.test(label.trim()) ? `${label.trim()} at ${place.aliases[0] ?? place.name}` : label.trim();
      await apiFetch("/api/schedule/connections", {
        method: "POST",
        body: { provider: "plan", label: title.slice(0, 60), date, start, end, ...(place ? { placeId: place.id } : {}) },
      });
      onDone(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save the plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Add a plan</h3>
      <div className="flex flex-wrap gap-1.5">
        {PLAN_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={label === p}
            onClick={() => setLabel(p)}
            className={`rounded-full px-3 py-1 text-xs ${label === p ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
          >
            {p}
          </button>
        ))}
      </div>
      <label className="block text-xs text-neutral-600">
        What
        <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={50} />
      </label>
      <label className="block text-xs text-neutral-600">
        Where <span className="text-neutral-400">(optional)</span>
        <BuildingPicker place={place} onPick={setPlace} placeholder="Du Bois, ISB, Campus Center…" />
      </label>
      <div className="flex gap-2">
        <label className="block flex-[1.3] text-xs text-neutral-600">Day<input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="block flex-1 text-xs text-neutral-600">From<input type="time" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="block flex-1 text-xs text-neutral-600">To<input type="time" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" disabled={saving} onClick={save} className="rounded-full bg-[#881c1c] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60">
          {saving ? "Saving…" : "Add plan"}
        </button>
        <button type="button" onClick={() => onDone(false)} className="rounded-full px-4 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">Cancel</button>
      </div>
    </div>
  );
}

const DAYS: { id: Weekday; label: string }[] = [
  { id: "MO", label: "M" }, { id: "TU", label: "Tu" }, { id: "WE", label: "W" }, { id: "TH", label: "Th" }, { id: "FR", label: "F" },
];

function AddClassForm({ onDone }: { onDone: (saved: boolean) => void }) {
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<Weekday[]>([]);
  const [start, setStart] = useState("10:10");
  const [end, setEnd] = useState("11:00");
  const [room, setRoom] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);
    if (!label.trim()) return setError("Give the class a name, e.g. CICS 210.");
    if (!days.length) return setError("Pick at least one day.");
    if (end <= start) return setError("The end time must be after the start.");
    setSaving(true);
    try {
      await apiFetch("/api/schedule/connections", {
        method: "POST",
        body: { provider: "manual", label: label.trim(), days, start, end, ...(place ? { placeId: place.id } : {}), ...(room.trim() ? { room: room.trim() } : {}) },
      });
      onDone(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save the class");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Add a class</h3>
      <label className="block text-xs text-neutral-600">
        Course
        <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="CICS 210 Lecture" maxLength={60} />
      </label>
      <label className="block text-xs text-neutral-600">
        Building
        <BuildingPicker place={place} onPick={setPlace} placeholder="ILC, LGRT, Morrill…" />
      </label>
      <label className="block text-xs text-neutral-600">
        Room <span className="text-neutral-400">(optional)</span>
        <input className={inputCls} value={room} onChange={(e) => setRoom(e.target.value)} placeholder="S131" maxLength={30} />
      </label>
      <div>
        <div className="text-xs text-neutral-600">Days</div>
        <div className="mt-1 flex gap-1">
          {DAYS.map((d) => {
            const on = days.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={on}
                onClick={() => setDays(on ? days.filter((x) => x !== d.id) : [...days, d.id])}
                className={`h-9 w-10 rounded-lg border text-sm ${on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-700"}`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex gap-3">
        <label className="block flex-1 text-xs text-neutral-600">Starts<input type="time" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="block flex-1 text-xs text-neutral-600">Ends<input type="time" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" disabled={saving} onClick={save} className="rounded-full bg-[#881c1c] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60">
          {saving ? "Saving…" : "Save class"}
        </button>
        <button type="button" onClick={() => onDone(false)} className="rounded-full px-4 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">Cancel</button>
      </div>
    </div>
  );
}

function AddFeedForm({ onDone }: { onDone: (saved: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const trimmed = url.trim().replace(/^webcal:/i, "https:");
      const label = /instructure\.com/i.test(trimmed) ? "Canvas" : "Calendar feed";
      await apiFetch("/api/schedule/connections", { method: "POST", body: { provider: "ics", label, url: trimmed } });
      onDone(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not add the link");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Add Canvas deadlines</h3>
      <ol className="list-decimal space-y-0.5 pl-5 text-xs text-neutral-600">
        <li>Open Canvas and go to <b>Calendar</b>.</li>
        <li>At the bottom right, click <b>Calendar Feed</b> and copy the link.</li>
        <li>Paste it here. Treat it like a password: anyone with it can see your calendar.</li>
      </ol>
      <input
        className={inputCls}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://umamherst.instructure.com/feeds/calendars/user_…ics"
        autoComplete="off"
        spellCheck={false}
      />
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" disabled={saving || !url.trim()} onClick={save} className="rounded-full bg-[#881c1c] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60">
          {saving ? "Adding…" : "Add link"}
        </button>
        <button type="button" onClick={() => onDone(false)} className="rounded-full px-4 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">Cancel</button>
      </div>
    </div>
  );
}
