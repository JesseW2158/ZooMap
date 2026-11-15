"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  NotificationsResponse,
  type ActivityCategory,
  type Alert,
  type AlertKind,
  type AlertSettings,
  type AlertSettingsBody,
  type UpcomingAlert,
} from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import { isNativeShell } from "@/shared/platform";
import { createStore, mapActions, usePolling, useStore } from "@/shared/ui";

/**
 * Headless entry (mounted once by the shell): the bell in the top-right corner, its inbox and
 * settings, pop-ups for new alerts, and on-time reminders. Vercel has no push, so the inbox is
 * polled every minute, and alerts known in advance (`upcoming`) are fired by timers in this tab.
 */

const POLL_MS = 60_000;

const KIND: Record<AlertKind, { icon: string; label: string }> = {
  nearby: { icon: "📍", label: "Nearby" },
  "big-event": { icon: "🎉", label: "Big event" },
  going: { icon: "🎟️", label: "You're going" },
  exam: { icon: "📝", label: "Exam" },
  project: { icon: "📂", label: "Project" },
  assignment: { icon: "⏰", label: "Due soon" },
  "quiet-room": { icon: "🤫", label: "Quiet room" },
  "leave-by": { icon: "🚶", label: "Leave for class" },
  points: { icon: "⭐", label: "Points" },
  activity: { icon: "👋", label: "Your activity" },
};

interface Toast {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  placeId?: string;
}

const store = createStore<{ data: NotificationsResponse | null; toasts: Toast[] }>({ data: null, toasts: [] });

async function load(signal?: AbortSignal) {
  const data = await apiFetch("/api/notifications", { signal, schema: NotificationsResponse });
  store.set({ data });
}

function pushToast(t: Toast) {
  store.set((s) => ({ toasts: [t, ...s.toasts.filter((x) => x.id !== t.id)].slice(0, 3) }));
  setTimeout(() => store.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), 9000);
}

/** A system notification, when this browser allows them. Inside the Android shell this is the native side's job. */
function systemNotify(t: Toast, settings: AlertSettings | undefined) {
  if (isNativeShell() || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const hide = settings?.hideDetails;
    const n = new Notification(hide ? "ZooMap" : t.title, { body: hide ? `${KIND[t.kind].label} reminder` : t.body, tag: t.id });
    n.onclick = () => {
      window.focus();
      if (t.placeId) mapActions.requestRoute(t.placeId);
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function at(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Headless (mounted once): polls the inbox, pops up new alerts and fires the ones known in
 * advance on time. The bell itself is `AlertsBell`, which the shell places beside the account.
 */
export function AlertsCenter() {
  const data = useStore(store, (s) => s.data);
  const toasts = useStore(store, (s) => s.toasts);
  const seen = useRef<Set<string> | null>(null);

  usePolling((signal) => load(signal), { intervalMs: POLL_MS });

  // new unread alerts since the last poll pop up; the backlog at first load does not
  useEffect(() => {
    if (!data) return;
    if (!seen.current) {
      seen.current = new Set(data.alerts.map((a) => a.id));
      return;
    }
    for (const a of [...data.alerts].reverse()) {
      if (seen.current.has(a.id)) continue;
      seen.current.add(a.id);
      if (a.read) continue;
      const t = { id: a.id, kind: a.kind, title: a.title, body: a.body, placeId: a.placeId };
      pushToast(t);
      if (document.hidden) systemNotify(t, data.settings);
    }
  }, [data]);

  // alerts known in advance fire on time from this tab, then the next poll files them in the inbox
  const upcoming = data?.upcoming;
  useEffect(() => {
    if (!upcoming?.length) return;
    const timers = upcoming.map((u) =>
      setTimeout(() => {
        const ids = seen.current ?? new Set<string>();
        seen.current = ids;
        if (ids.has(u.id)) return;
        ids.add(u.id);
        const t = { id: u.id, kind: u.kind, title: u.title, body: u.body, placeId: u.placeId };
        pushToast(t);
        systemNotify(t, store.get().data?.settings);
        setTimeout(() => void load().catch(() => {}), 5000);
      }, Math.max(0, new Date(u.fireAt).getTime() - Date.now())),
    );
    return () => timers.forEach(clearTimeout);
  }, [upcoming]);

  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none absolute left-3 right-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] z-30 flex flex-col items-center gap-2 md:items-end">
      {toasts.map((t) => (
        <div key={t.id} role="status" className="pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-xl border border-neutral-200 bg-white p-3 text-neutral-900 shadow-lg">
          <span className="text-lg leading-none" aria-hidden>{KIND[t.kind].icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t.title}</p>
            <p className="text-xs text-neutral-600">{t.body}</p>
            {t.placeId ? (
              <button
                type="button"
                onClick={() => {
                  mapActions.requestRoute(t.placeId!);
                  store.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }));
                }}
                className="mt-1 text-xs font-semibold text-[#881c1c] hover:underline max-md:flex max-md:min-h-11 max-md:items-center"
              >
                Show route →
              </button>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => store.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }))}
            className="inline-flex items-center justify-center px-1 text-neutral-400 hover:text-neutral-700 max-md:min-h-11 max-md:min-w-11"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * The bell and its inbox. The shell renders it in the top bar beside the account button, on
 * the map and in every page header, so it lines up with the account and scrolls with the
 * header. The inbox drops below it, aligned with the account button's right edge.
 */
export function AlertsBell() {
  const data = useStore(store, (s) => s.data);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"inbox" | "settings">("inbox");
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close the inbox; `refocus` hands focus back to the bell (keyboard and Close button), but not
  // after a tap elsewhere or after following an alert, where focus belongs to what was chosen.
  const closeInbox = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) bellRef.current?.focus();
  }, []);

  // The inbox drops over the same corner as the account menu, so a tap anywhere else closes it
  // (opening the account menu therefore closes the inbox, and the two are never open together).
  // Escape closes it too. Capture phase, so a map or panel that stops propagation cannot swallow the tap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (bellRef.current?.contains(t) || panelRef.current?.contains(t))) return;
      closeInbox(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeInbox(true);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closeInbox]);

  // keyboard users land inside the inbox when it opens
  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open]);

  const unread = data?.unread ?? 0;

  const openInbox = () => {
    const next = !open;
    setOpen(next);
    setView("inbox");
    if (next && unread > 0 && data) {
      // opening the inbox reads it
      store.set({ data: { ...data, unread: 0, alerts: data.alerts.map((a) => ({ ...a, read: true })) } });
      void apiFetch("/api/notifications/read", { method: "POST", body: { all: true } }).catch(() => {});
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        ref={bellRef}
        onClick={openInbox}
        aria-label={unread ? `Alerts, ${unread} new` : "Alerts"}
        aria-expanded={open}
        title="Alerts"
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-md ring-2 ring-ivory/80 before:absolute before:-inset-0.5 before:content-[''] hover:bg-ivory"
      >
        <BellIcon />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-coral px-1 text-center text-[11px] font-bold leading-5 text-ink ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        // right edge lines up with the account button (one button and a gap to the right)
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Alerts"
          tabIndex={-1}
          className="absolute -right-12 top-[calc(100%+0.5rem)] z-50 flex max-h-[70dvh] w-[min(23rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left text-neutral-900 shadow-xl outline-none"
        >
          <div className="flex items-center gap-1 border-b border-neutral-100 px-3 py-2">
            <h2 className="flex-1 text-sm font-semibold">{view === "inbox" ? "Alerts" : "Alert settings"}</h2>
            <button
              type="button"
              onClick={() => setView(view === "inbox" ? "settings" : "inbox")}
              className="rounded-lg px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 max-md:min-h-11"
            >
              {view === "inbox" ? "⚙ Settings" : "← Alerts"}
            </button>
            <button type="button" aria-label="Close alerts" onClick={() => closeInbox(true)} className="inline-flex items-center justify-center rounded-lg px-2 py-1 text-neutral-400 hover:bg-neutral-100 max-md:min-h-11 max-md:min-w-11">
              ✕
            </button>
          </div>
          <div className="overflow-y-auto">
            {view === "inbox" ? (
              <Inbox data={data} onPick={() => closeInbox(false)} />
            ) : data ? (
              <Settings settings={data.settings} />
            ) : (
              <p className="p-4 text-sm text-neutral-500">Loading…</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

// ---------------------------------------------------------------- inbox

function Inbox({ data, onPick }: { data: NotificationsResponse | null; onPick: () => void }) {
  if (!data) return <p className="p-4 text-sm text-neutral-500">Loading…</p>;
  const pick = (placeId?: string) => {
    if (!placeId) return;
    mapActions.requestRoute(placeId);
    onPick();
  };
  return (
    <div className="divide-y divide-neutral-100">
      {data.alerts.length === 0 ? (
        <p className="p-4 text-sm text-neutral-500">
          No alerts yet. You will hear about exams, things happening near you, and quiet rooms for your free time here.
        </p>
      ) : (
        data.alerts.map((a) => <Row key={a.id} alert={a} onPick={pick} />)
      )}
      {data.upcoming.length ? (
        <section className="bg-neutral-50 p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Coming up today</h3>
          <ul className="space-y-1">
            {data.upcoming.slice(0, 6).map((u) => (
              <Upcoming key={u.id} item={u} onPick={pick} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Row({ alert, onPick }: { alert: Alert; onPick: (placeId?: string) => void }) {
  const body = (
    <>
      <span className="text-lg leading-none" aria-hidden>{KIND[alert.kind].icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{alert.title}</span>
        <span className="block text-xs text-neutral-600">{alert.body}</span>
        <span className="mt-0.5 block text-[11px] text-neutral-400">
          {KIND[alert.kind].label} · {ago(alert.at)}
          {alert.placeId ? " · tap for route" : ""}
        </span>
      </span>
      {!alert.read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#881c1c]" aria-label="New" /> : null}
    </>
  );
  return alert.placeId ? (
    <button type="button" onClick={() => onPick(alert.placeId)} className="flex w-full items-start gap-2 p-3 text-left hover:bg-neutral-50">
      {body}
    </button>
  ) : (
    <div className="flex items-start gap-2 p-3">{body}</div>
  );
}

function Upcoming({ item, onPick }: { item: UpcomingAlert; onPick: (placeId?: string) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onPick(item.placeId)} className="flex w-full items-start gap-2 rounded-lg p-1 text-left text-xs hover:bg-white max-md:min-h-11 max-md:items-center">
        <span className="w-14 shrink-0 font-semibold text-neutral-700">{at(item.fireAt)}</span>
        <span className="min-w-0 flex-1 text-neutral-700">
          {KIND[item.kind].icon} {item.title}
        </span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------- settings

const CATEGORIES: ActivityCategory[] = ["study", "social", "sports", "food", "other"];

function Settings({ settings }: { settings: AlertSettings }) {
  // the settings view is short-lived, so "now" is when it opened
  const [openedAt] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<string>(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));

  const save = async (patch: AlertSettingsBody) => {
    const data = store.get().data;
    if (data) store.set({ data: { ...data, settings: { ...data.settings, ...patch } } });
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/notifications/settings", { method: "PUT", body: patch });
      await load();
    } catch {
      setError("Could not save. Try again.");
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const paused = settings.pausedUntil !== null && new Date(settings.pausedUntil).getTime() > openedAt;
  const tomorrowMorning = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(7, 0, 0, 0);
    return d.toISOString();
  };

  return (
    <div className="space-y-4 p-3 text-sm" aria-busy={busy}>
      {error ? <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p> : null}

      <Group title="Pause">
        <div className="flex flex-wrap gap-1">
          {paused ? (
            <Chip active onClick={() => save({ pausedUntil: null })}>
              Paused until {new Date(settings.pausedUntil!).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })} · Resume
            </Chip>
          ) : (
            <>
              <Chip onClick={() => save({ pausedUntil: new Date(Date.now() + 3_600_000).toISOString() })}>Pause 1 hour</Chip>
              <Chip onClick={() => save({ pausedUntil: tomorrowMorning() })}>Until tomorrow</Chip>
            </>
          )}
        </div>
      </Group>

      <Group title="Around you">
        <Toggle label="Activities near me" hint="Needs location sharing, in the Map tab." on={settings.nearby} onChange={(v) => save({ nearby: v })} />
        {settings.nearby ? (
          <div className="ml-1 space-y-2 border-l-2 border-neutral-100 pl-3">
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs text-neutral-500">Within</span>
              {[100, 200, 400].map((m) => (
                <Chip key={m} active={settings.nearbyRadiusM === m} onClick={() => save({ nearbyRadiusM: m })}>
                  {m} m
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs text-neutral-500">Kinds</span>
              <Chip active={settings.nearbyCategories.length === 0} onClick={() => save({ nearbyCategories: [] })}>
                All
              </Chip>
              {CATEGORIES.map((c) => {
                const on = settings.nearbyCategories.includes(c);
                return (
                  <Chip
                    key={c}
                    active={on}
                    onClick={() => save({ nearbyCategories: on ? settings.nearbyCategories.filter((x) => x !== c) : [...settings.nearbyCategories, c] })}
                  >
                    {c}
                  </Chip>
                );
              })}
            </div>
          </div>
        ) : null}
        <Toggle label="Big events on campus" hint="When one is announced, then a week, a day and an hour before. 50+ spots or 15+ going." on={settings.bigEvents} onChange={(v) => save({ bigEvents: v })} />
      </Group>

      <Group title="Classes">
        <Toggle label="Exams and quizzes" hint="A week, 3 days and a day before; 2 hours before the exam." on={settings.exams} onChange={(v) => save({ exams: v })} />
        <Toggle label="Projects and papers" hint="3 days and a day before." on={settings.projects} onChange={(v) => save({ projects: v })} />
        <Toggle label="Other assignments" hint="The day before." on={settings.assignments} onChange={(v) => save({ assignments: v })} />
        <Toggle label="Leave for class" on={settings.leaveBy} onChange={(v) => save({ leaveBy: v })} />
        {settings.leaveBy ? (
          <div className="ml-1 flex flex-wrap items-center gap-1 border-l-2 border-neutral-100 pl-3">
            <span className="mr-1 text-xs text-neutral-500">Warn me</span>
            {[0, 5, 10].map((m) => (
              <Chip key={m} active={settings.leaveByLeadMin === m} onClick={() => save({ leaveByLeadMin: m })}>
                {m === 0 ? "when it's time" : `${m} min early`}
              </Chip>
            ))}
          </div>
        ) : null}
        <Toggle
          label="Quiet rooms in my free time"
          hint="When you have 30+ minutes between classes, a quiet study spot that fits."
          on={settings.quietRooms}
          onChange={(v) => save({ quietRooms: v })}
        />
      </Group>

      <Group title="Updates">
        <Toggle label="Points, my activities, events I\u2019m going to" on={settings.updates} onChange={(v) => save({ updates: v })} />
      </Group>

      <Group title="Quiet and privacy">
        <Toggle
          label="Quiet hours, 11pm to 7am"
          on={settings.quietHours !== null}
          onChange={(v) => save({ quietHours: v ? { start: "23:00", end: "07:00" } : null })}
        />
        <Toggle label="Hide details on the lock screen" on={settings.hideDetails} onChange={(v) => save({ hideDetails: v })} />
      </Group>

      {!isNativeShell() ? (
        <Group title="This device">
          {permission === "granted" ? (
            <p className="text-xs text-emerald-700">Pop-up notifications are on for this browser. They work while ZooMap is open in a tab.</p>
          ) : permission === "denied" ? (
            <p className="text-xs text-neutral-600">Notifications are blocked for this site. Allow them in the browser&apos;s site settings to get pop-ups outside the tab.</p>
          ) : permission === "unsupported" ? (
            <p className="text-xs text-neutral-600">This browser cannot show notifications; alerts appear inside ZooMap.</p>
          ) : (
            <button
              type="button"
              onClick={async () => setPermission(await Notification.requestPermission())}
              className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white max-md:min-h-11"
            >
              Allow pop-up notifications
            </button>
          )}
        </Group>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 max-md:min-h-11 max-md:items-center">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {hint ? <span className="block text-xs text-neutral-500">{hint}</span> : null}
      </span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#881c1c] ${on ? "bg-[#881c1c]" : "bg-neutral-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.125rem]" : "left-0.5"}`} />
      </span>
    </label>
  );
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs capitalize max-md:min-h-11 max-md:min-w-11 ${active ? "border-[#881c1c] bg-[#881c1c] text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}
    >
      {children}
    </button>
  );
}
