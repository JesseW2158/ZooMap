"use client";

import { useEffect, useMemo, useState } from "react";
import type { Place, RouteResult, ScheduleConnection, ScheduleEvent, Weekday } from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { openExternalAuth, useUserLocation } from "@/shared/platform";
import { useApi, useMapStore } from "@/shared/ui";

/**
 * The Schedule tab: a "Next up" card with walking time and a leave-by time, today's classes,
 * Canvas deadlines due soon, and the user's calendars (Canvas link, Google Calendar,
 * classes added by hand).
 */

const TZ = "America/New_York";
const DAY_MS = 86_400_000;
/** Leave this much earlier than the walk alone needs. */
const BUFFER_MIN = 2;

const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const utcDayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const utcDayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" });

const fmtTime = (iso: string) => timeFmt.format(new Date(iso)).replace(" ", "").toLowerCase();
/** Campus-local date key; all-day events are dated in UTC (see the contract). */
const dayKey = (e: ScheduleEvent) => (e.allDay ? utcDayKeyFmt : dayKeyFmt).format(new Date(e.start));

const STATUS_MESSAGES: Record<string, string> = {
  "google-connected": "Google Calendar connected.",
  "google-denied": "Google Calendar was not connected: access was not granted.",
  "google-error": "Google Calendar could not be connected. Try again.",
  "google-unavailable": "Google Calendar is not set up on this server yet. Use a Canvas link or add classes by hand.",
};

export function SchedulePanel() {
  const [range] = useState(() => {
    const now = Date.now();
    return { from: new Date(now - 6 * 3600_000).toISOString(), to: new Date(now + 8 * DAY_MS).toISOString() };
  });
  const events = useApi<ScheduleEvent[]>(`/api/schedule/events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`, { pollMs: 5 * 60_000 });
  const connections = useApi<ScheduleConnection[]>("/api/schedule/connections");
  const [adding, setAdding] = useState<null | "class" | "canvas">(null);
  const [notice] = useState(() => {
    if (typeof window === "undefined") return null;
    const flag = new URLSearchParams(window.location.search).get("schedule");
    return flag ? (STATUS_MESSAGES[flag] ?? null) : null;
  });
  const refresh = () => {
    events.refresh();
    connections.refresh();
  };

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const all = useMemo(() => events.data ?? [], [events.data]);
  const todayKey = dayKeyFmt.format(new Date(now));
  const classes = all.filter((e) => !e.deadline && !e.allDay);
  const next = classes.find((e) => new Date(e.end).getTime() > now);
  const today = classes.filter((e) => dayKey(e) === todayKey);
  const due = all.filter((e) => e.deadline && (e.allDay ? dayKey(e) >= todayKey : new Date(e.start).getTime() >= now)).slice(0, 8);
  const conns = connections.data ?? [];

  if (connections.loading && !connections.data) return <p className="p-4 text-sm text-neutral-500">Loading your schedule…</p>;
  if (connections.error?.code === "UNAUTHORIZED") return <p className="p-4 text-sm text-neutral-600">Sign in to see your schedule.</p>;

  return (
    <div className="space-y-4 p-4 text-neutral-900">
      {notice ? <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">{notice}</p> : null}

      {conns.length === 0 && !adding ? (
        <ConnectScreen onPick={setAdding} />
      ) : null}

      {adding === "class" ? <AddClassForm onDone={(saved) => { setAdding(null); if (saved) refresh(); }} /> : null}
      {adding === "canvas" ? <AddFeedForm onDone={(saved) => { setAdding(null); if (saved) refresh(); }} /> : null}

      {conns.length > 0 && !adding ? (
        <>
          {next ? <NextUp event={next} now={now} /> : (
            <p className="rounded-xl border border-neutral-200 p-3 text-sm text-neutral-600">No more classes in the next week.</p>
          )}

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Today</h3>
            {today.length ? (
              <ul className="divide-y divide-neutral-100">
                {today.map((e) => <ClassRow key={e.id} event={e} past={new Date(e.end).getTime() < now} />)}
              </ul>
            ) : (
              <p className="text-sm text-neutral-500">No classes today.</p>
            )}
          </section>

          {due.length ? (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Due soon</h3>
              <ul className="divide-y divide-neutral-100">
                {due.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-3 py-1.5 text-sm">
                    <span className="w-24 shrink-0 text-xs text-neutral-500">
                      {dayKey(e) === todayKey ? "Today" : (e.allDay ? utcDayFmt : dayFmt).format(new Date(e.start))}
                      {e.allDay ? "" : ` ${fmtTime(e.start)}`}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{e.title}</span>
                    {e.course ? <span className="shrink-0 text-xs text-neutral-400">{e.course}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <Calendars connections={conns} onChanged={refresh} onAdd={setAdding} />
          {events.error ? <p className="text-xs text-red-700">Could not load events: {events.error.message}</p> : null}
        </>
      ) : null}
    </div>
  );
}

function ConnectScreen({ onPick }: { onPick: (kind: "class" | "canvas") => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-700">Add your classes to see when to leave and how to get there.</p>
      <button type="button" onClick={() => onPick("class")} className="w-full rounded-xl border border-neutral-200 p-3 text-left hover:bg-neutral-50">
        <div className="text-sm font-semibold">Add a class</div>
        <div className="text-xs text-neutral-500">Course, building, days and time, from your SPIRE schedule. Takes a minute per class.</div>
      </button>
      <button type="button" onClick={() => openExternalAuth("/api/schedule/google/connect")} className="w-full rounded-xl border border-neutral-200 p-3 text-left hover:bg-neutral-50">
        <div className="text-sm font-semibold">Connect Google Calendar</div>
        <div className="text-xs text-neutral-500">If your classes are in Google Calendar. Read-only.</div>
      </button>
      <button type="button" onClick={() => onPick("canvas")} className="w-full rounded-xl border border-neutral-200 p-3 text-left hover:bg-neutral-50">
        <div className="text-sm font-semibold">Add Canvas deadlines</div>
        <div className="text-xs text-neutral-500">Paste your Canvas calendar feed link to see assignments due soon.</div>
      </button>
    </div>
  );
}

/** Walking time from here, leave-by time and a route button for the next class. */
function NextUp({ event, now }: { event: ScheduleEvent; now: number }) {
  const { requestRoute, selectPlace } = useMapStore();
  const { position, start: startLocation, status } = useUserLocation();
  const [walk, setWalk] = useState<{ key: string; durationS?: number; error?: string } | null>(null);

  // re-ask when the class changes or the user has moved about 100 m
  const fromKey = position ? `${position.lat.toFixed(3)},${position.lng.toFixed(3)}` : null;
  const key = event.placeId && fromKey ? `${event.placeId}|${fromKey}` : null;
  useEffect(() => {
    if (!key || !event.placeId || !position) return;
    const controller = new AbortController();
    const q = new URLSearchParams({ to: event.placeId, fromLat: position.lat.toFixed(6), fromLng: position.lng.toFixed(6) });
    apiFetch<RouteResult>(`/api/route?${q}`, { signal: controller.signal })
      .then((r) => setWalk({ key, durationS: r.durationS }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setWalk({ key, error: err instanceof ApiClientError && err.code === "OFF_CAMPUS" ? "You're off campus" : "No walking time" });
      });
    return () => controller.abort();
    // position is read through `key`, which changes only when it moves meaningfully
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const start = new Date(event.start).getTime();
  const inProgress = start <= now;
  const current = walk && walk.key === key ? walk : null;
  const walkMin = current?.durationS !== undefined ? Math.max(1, Math.round(current.durationS / 60)) : null;
  const leaveBy = walkMin !== null ? start - (walkMin + BUFFER_MIN) * 60_000 : null;
  const minsToLeave = leaveBy !== null ? Math.round((leaveBy - now) / 60_000) : null;

  return (
    <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-[#881c1c]">{inProgress ? "Now" : "Next up"}</div>
      <div className="mt-0.5 text-base font-semibold">{event.title}</div>
      <div className="text-sm text-neutral-600">
        {dayKeyFmt.format(new Date(start)) === dayKeyFmt.format(new Date(now)) ? "" : `${dayFmt.format(new Date(start))}, `}
        {fmtTime(event.start)}–{fmtTime(event.end)}
        {event.locationText ? ` · ${event.locationText}` : ""}
      </div>

      {!inProgress && event.placeId ? (
        <div className="mt-2 text-sm">
          {walkMin !== null && leaveBy !== null ? (
            <p>
              <span className="font-semibold">Leave by {timeFmt.format(new Date(leaveBy)).replace(" ", "").toLowerCase()}</span>
              <span className="text-neutral-600">
                {" "}· {walkMin} min walk
                {minsToLeave !== null && minsToLeave >= 0 && minsToLeave < 120 ? ` · in ${minsToLeave} min` : ""}
                {minsToLeave !== null && minsToLeave < 0 ? " · you're late, go now" : ""}
              </span>
            </p>
          ) : position ? (
            <p className="text-neutral-500">{current?.error ?? "Working out the walk…"}</p>
          ) : status === "denied" || status === "unavailable" ? (
            <p className="text-neutral-500">Location is off, so no walking time.</p>
          ) : (
            <button type="button" onClick={startLocation} className="text-sm font-medium text-[#1663d6] hover:underline">
              {status === "requesting" ? "Finding you…" : "Use my location for the walking time"}
            </button>
          )}
        </div>
      ) : null}
      {!event.placeId && event.locationText ? (
        <p className="mt-1 text-xs text-neutral-500">Could not place “{event.locationText}” on the map.</p>
      ) : null}

      {event.placeId ? (
        <button
          type="button"
          onClick={() => { selectPlace(event.placeId!); requestRoute(event.placeId!); }}
          className="mt-2 rounded-full bg-[#881c1c] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#6f1616]"
        >
          Route
        </button>
      ) : null}
    </section>
  );
}

function ClassRow({ event, past }: { event: ScheduleEvent; past: boolean }) {
  const { requestRoute, selectPlace } = useMapStore();
  return (
    <li className={`flex items-center gap-3 py-2 text-sm ${past ? "opacity-50" : ""}`}>
      <span className="w-16 shrink-0 tabular-nums text-neutral-600">{fmtTime(event.start)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{event.title}</span>
        {event.locationText ? <span className="block truncate text-xs text-neutral-500">{event.locationText}</span> : null}
      </span>
      {event.placeId && !past ? (
        <button
          type="button"
          onClick={() => { selectPlace(event.placeId!); requestRoute(event.placeId!); }}
          className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-[#881c1c] hover:bg-neutral-50"
        >
          Route
        </button>
      ) : null}
    </li>
  );
}

function Calendars({ connections, onChanged, onAdd }: { connections: ScheduleConnection[]; onChanged: () => void; onAdd: (k: "class" | "canvas") => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const remove = async (id: string) => {
    setBusy(id);
    try {
      await apiFetch(`/api/schedule/connections?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(null);
    }
  };
  return (
    <details className="rounded-xl border border-neutral-200">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-neutral-700">
        My classes and calendars ({connections.length})
      </summary>
      <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
        {connections.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{c.label}</span>
              <span className="block truncate text-xs text-neutral-500">{c.summary}</span>
              {c.lastError ? <span className="block text-xs text-red-700">{c.lastError}</span> : null}
            </span>
            <button
              type="button"
              aria-label={`Remove ${c.label}`}
              disabled={busy === c.id}
              onClick={() => remove(c.id)}
              className="rounded-full px-2 py-1 text-neutral-400 hover:bg-neutral-100 hover:text-red-700"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 border-t border-neutral-100 p-3">
        <button type="button" onClick={() => onAdd("class")} className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium hover:bg-neutral-50">+ Class</button>
        <button type="button" onClick={() => onAdd("canvas")} className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium hover:bg-neutral-50">+ Canvas link</button>
        {!connections.some((c) => c.provider === "google") ? (
          <button type="button" onClick={() => openExternalAuth("/api/schedule/google/connect")} className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium hover:bg-neutral-50">+ Google Calendar</button>
        ) : null}
      </div>
    </details>
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
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!q.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch<Place[]>(`/api/places?q=${encodeURIComponent(q.trim())}`, { signal: controller.signal }).then(setResults).catch(() => {});
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q]);

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

  const input = "w-full rounded-lg border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-neutral-400";
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Add a class</h3>
      <label className="block text-xs text-neutral-600">
        Course
        <input className={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="CICS 210 Lecture" maxLength={60} />
      </label>
      <div className="relative">
        <label className="block text-xs text-neutral-600">
          Building
          {place ? (
            <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-1.5 text-sm">
              <span>{place.name}</span>
              <button type="button" className="text-xs text-neutral-500 hover:underline" onClick={() => { setPlace(null); setQ(""); }}>change</button>
            </div>
          ) : (
            <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ILC, LGRT, Morrill…" />
          )}
        </label>
        {!place && q.trim() && results.length ? (
          <ul className="absolute left-0 right-0 z-10 mt-1 max-h-40 overflow-auto rounded-lg border border-neutral-200 bg-white shadow">
            {results.slice(0, 6).map((p) => (
              <li key={p.id}>
                <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-100" onClick={() => { setPlace(p); setResults([]); }}>{p.name}</button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <label className="block text-xs text-neutral-600">
        Room <span className="text-neutral-400">(optional)</span>
        <input className={input} value={room} onChange={(e) => setRoom(e.target.value)} placeholder="S131" maxLength={30} />
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
        <label className="block flex-1 text-xs text-neutral-600">Starts<input type="time" className={input} value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="block flex-1 text-xs text-neutral-600">Ends<input type="time" className={input} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
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
        className="w-full rounded-lg border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
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
