"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity as ActivitySchema,
  ActivityCategory,
  PlaceList,
  SharingState,
  type Activity,
  type ActivityMe,
  type Place,
} from "@/shared/contracts";
import { haversineM } from "@/shared/geo";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { useUserLocation } from "@/shared/platform";
import { useMapStore } from "@/shared/ui";
import { GEOFENCE_M } from "../rules";
import { CATEGORY_COLORS, CATEGORY_LABELS, refreshFeed, useActivitiesFeed } from "./feed";
import {
  BallIcon,
  BookIcon,
  BubblesIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  CoinIcon,
  ExitIcon,
  FlagIcon,
  GoIcon,
  MoonIcon,
  PinIcon,
  PlusIcon,
  SparkleIcon,
  StopIcon,
  UsersIcon,
  UtensilsIcon,
} from "./icons";

type IconC = (p: { className?: string }) => ReactNode;
const CATEGORY_ICON: Record<Activity["category"], IconC> = {
  study: BookIcon,
  social: BubblesIcon,
  sports: BallIcon,
  food: UtensilsIcon,
  other: SparkleIcon,
};

/** A category's symbol, drawn in the category colour. */
function CatIcon({ category, className }: { category: Activity["category"]; className?: string }) {
  const Icon = CATEGORY_ICON[category];
  return (
    <span style={{ color: CATEGORY_COLORS[category] }} className="inline-flex">
      <Icon className={className} />
    </span>
  );
}

/** The category colour as a soft tint, for the round badge. */
const tint = (c: Activity["category"]) => `${CATEGORY_COLORS[c]}22`;

/**
 * Activities: the one you are in (a live card with verified time), a row of category bubbles
 * that start hosting, and everything happening now as cards, nearest first.
 */
export function ActivitiesPanel() {
  const { activities, me, sharing, error } = useActivitiesFeed();
  const { position } = useUserLocation();
  const [hosting, setHosting] = useState<Activity["category"] | null>(null);
  const [filter, setFilter] = useState<Activity["category"] | null>(null);
  const inActivity = !!me?.participation;

  const sorted = useMemo(() => {
    const list = [...(activities ?? [])].filter((a) => !filter || a.category === filter);
    const dist = (a: Activity) => (position && a.placeCenter ? haversineM(position, a.placeCenter) : Infinity);
    return list.sort((a, b) => dist(a) - dist(b) || b.startedAt.localeCompare(a.startedAt));
  }, [activities, position, filter]);

  const counts = useMemo(() => {
    const c = new Map<Activity["category"], number>();
    for (const a of activities ?? []) c.set(a.category, (c.get(a.category) ?? 0) + 1);
    return c;
  }, [activities]);

  return (
    <div className="space-y-5 text-sm text-ink">
      {inActivity && me?.activity ? <CurrentActivity me={me} sharing={sharing} /> : null}

      {!inActivity && hosting ? (
        <HostForm initialCategory={hosting} onDone={() => setHosting(null)} />
      ) : null}

      {!inActivity && !hosting ? (
        <section>
          <SectionLabel Icon={PlusIcon} text="Start something" />
          <div className="mt-2 flex justify-between gap-1">
            {ActivityCategory.options.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setHosting(c)}
                aria-label={`Host ${CATEGORY_LABELS[c].toLowerCase()}`}
                className="group flex w-16 flex-col items-center gap-1.5 text-xs font-medium text-yale"
              >
                <span
                  className="relative flex h-14 w-14 items-center justify-center rounded-full text-2xl ring-2 ring-transparent transition group-hover:scale-105 group-hover:ring-ink/20"
                  style={{ backgroundColor: tint(c) }}
                >
                  <CatIcon category={c} className="h-6 w-6" />
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-ivory ring-2 ring-white">
                    <PlusIcon className="h-3 w-3" />
                  </span>
                </span>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel live text="Live now" count={activities?.length} />
          {filter ? (
            <button type="button" onClick={() => setFilter(null)} className="flex items-center gap-1 rounded-full bg-linen px-2.5 py-1 text-xs font-semibold">
              <CatIcon category={filter} className="h-3.5 w-3.5" /> {CATEGORY_LABELS[filter]} <CloseIcon className="h-3 w-3" />
            </button>
          ) : counts.size > 1 ? (
            <div className="flex gap-1" role="group" aria-label="Filter by category">
              {[...counts.keys()].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFilter(c)}
                  aria-label={`Only ${CATEGORY_LABELS[c]}`}
                  title={CATEGORY_LABELS[c]}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-linen text-base hover:bg-ash/50"
                >
                  <CatIcon category={c} className="h-4 w-4" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {error ? <p className="text-red-600">{error}</p> : null}
        {activities === null && !error ? (
          <ul className="space-y-2">
            {[0, 1].map((i) => (
              <li key={i} className="h-20 animate-pulse rounded-2xl bg-linen" />
            ))}
          </ul>
        ) : null}
        {activities?.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-2xl bg-linen px-4 py-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-yale" aria-hidden>
              <MoonIcon className="h-7 w-7" />
            </span>
            <p className="font-semibold">Quiet right now</p>
            <p className="text-yale">Tap a bubble above to start something.</p>
          </div>
        ) : null}
        <ul className="space-y-2">
          {sorted.map((a) => (
            <ActivityRow key={a.id} activity={a} mine={a.id === me?.activity?.id && inActivity} canJoin={!inActivity} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function SectionLabel({ Icon, live = false, text, count }: { Icon?: IconC; live?: boolean; text: string; count?: number }) {
  return (
    <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-yale">
      {live ? (
        <span aria-hidden className="relative flex h-2.5 w-2.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-red-500/60" />
          <span className="relative h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
      ) : Icon ? (
        <Icon className="h-4 w-4" />
      ) : null}
      {text}
      {count !== undefined ? <span className="rounded-full bg-linen px-2 py-0.5 text-[11px] text-ink">{count}</span> : null}
    </h2>
  );
}

function errorText(cause: unknown): string {
  return cause instanceof ApiClientError ? cause.message : "Something went wrong";
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

function sinceShort(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return min < 1 ? "now" : min < 60 ? `${min}m` : `${Math.floor(min / 60)}h`;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function CategoryBubble({ category, size = 48 }: { category: Activity["category"]; size?: number }) {
  return (
    <span
      aria-label={CATEGORY_LABELS[category]}
      role="img"
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: tint(category) }}
    >
      <span style={{ color: CATEGORY_COLORS[category], width: size * 0.5, height: size * 0.5 }} className="inline-flex">
        {(() => {
          const Icon = CATEGORY_ICON[category];
          return <Icon className="h-full w-full" />;
        })()}
      </span>
    </span>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  tone = "light",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "light" | "dark" | "danger";
  children: ReactNode;
}) {
  const tones = {
    light: "bg-linen text-ink hover:bg-ash/50",
    dark: "bg-ink text-ivory hover:bg-yale",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function ActivityRow({ activity: a, mine, canJoin }: { activity: Activity; mine: boolean; canJoin: boolean }) {
  const { position } = useUserLocation();
  const { selectedPlaceId, requestRoute, flyTo, selectPlace } = useMapStore();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const distance = position && a.placeCenter ? haversineM(position, a.placeCenter) : null;
  const full = a.capacity !== undefined && a.participantCount >= a.capacity;

  const join = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/api/activities/${a.id}/join`, { method: "POST" });
      await refreshFeed();
    } catch (cause) {
      setMessage(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      className={`rounded-2xl bg-white p-3 shadow-sm ring-1 transition ${
        mine ? "ring-2 ring-coral" : a.placeId === selectedPlaceId ? "ring-2 ring-jasmine" : "ring-ink/10"
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => {
            selectPlace(a.placeId);
            if (a.placeCenter) flyTo(a.placeCenter);
          }}
        >
          <CategoryBubble category={a.category} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{a.title}</span>
            <span className="flex items-center gap-1 truncate text-xs text-yale">
              <PinIcon className="h-3.5 w-3.5 shrink-0" />
              {a.placeName ?? a.placeId}
              {distance !== null ? ` · ${formatDistance(distance)}` : ""}
            </span>
            <span className="mt-0.5 flex items-center gap-3 text-xs text-yale">
              <span title="People" className="flex items-center gap-1">
                <UsersIcon className="h-3.5 w-3.5" />
                {a.participantCount}
                {a.capacity ? `/${a.capacity}` : ""}
              </span>
              <span title={`Started ${clock(a.startedAt)}`} className="flex items-center gap-1"><ClockIcon className="h-3.5 w-3.5" />{sinceShort(a.startedAt)}</span>
              {a.endsAt ? <span title="Ends" className="flex items-center gap-1"><FlagIcon className="h-3.5 w-3.5" />{clock(a.endsAt)}</span> : null}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 gap-2">
          <IconButton label="Directions" onClick={() => requestRoute(a.placeId)}>
            <GoIcon className="h-4 w-4" />
          </IconButton>
          {canJoin ? (
            <IconButton label={full ? "Full" : "Join"} tone="dark" disabled={busy || full} onClick={join}>
              {full ? <span className="text-[10px] font-bold">FULL</span> : <PlusIcon className="h-5 w-5" />}
            </IconButton>
          ) : mine ? (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-coral text-ink" title="You're in">
              <CheckIcon className="h-5 w-5" />
            </span>
          ) : null}
        </div>
      </div>
      {a.description ? <p className="mt-2 line-clamp-2 pl-[60px] text-yale">{a.description}</p> : null}
      <p className="mt-1 pl-[60px] text-[11px] text-yale/80">by {a.hostName}</p>
      {message ? <p className="mt-1 text-red-600">{message}</p> : null}
    </li>
  );
}

function CurrentActivity({ me, sharing }: { me: ActivityMe; sharing: boolean | null }) {
  const participation = me.participation!;
  const activity = me.activity!;
  const isHost = participation.role === "host";
  const { position } = useUserLocation();
  const { requestRoute } = useMapStore();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const distance = position && activity.placeCenter ? haversineM(position, activity.placeCenter) : null;
  const minutes = Math.floor(participation.verifiedSeconds / 60);
  const seconds = participation.verifiedSeconds % 60;

  const act = async (path: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(path, { method: "POST" });
      await refreshFeed();
    } catch (cause) {
      setMessage(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const turnOnSharing = async () => {
    setMessage(null);
    try {
      await apiFetch("/api/presence/sharing", { method: "PUT", body: { enabled: true }, schema: SharingState });
      await refreshFeed();
    } catch (cause) {
      setMessage(errorText(cause));
    }
  };

  let status: { dot: string; text: string; action?: { label: string; run: () => void } };
  if (sharing === false) {
    status = { dot: "bg-amber-400", text: "Location off · not counting", action: { label: "Turn on", run: turnOnSharing } };
  } else if (participation.verifying) {
    status = { dot: "bg-emerald-400 animate-pulse", text: "You're there · counting" };
  } else {
    status = {
      dot: "bg-ash",
      text:
        `Get within ${GEOFENCE_M} m to count` + (distance !== null && distance > GEOFENCE_M ? ` · ${formatDistance(distance)} away` : ""),
    };
  }

  return (
    <section className="overflow-hidden rounded-3xl bg-ink text-ivory shadow-lg">
      <div className="flex items-center gap-3 p-4 pb-3">
        <CategoryBubble category={activity.category} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-coral">{isHost ? "Hosting" : "You're in"}</p>
          <h2 className="truncate text-lg font-bold leading-tight">{activity.title}</h2>
          <p className="flex items-center gap-1 truncate text-xs text-ivory/70">
            <PinIcon className="h-3.5 w-3.5 shrink-0" /> {activity.placeName ?? activity.placeId}
            <UsersIcon className="ml-2 h-3.5 w-3.5 shrink-0" /> {activity.participantCount}
            {activity.capacity ? `/${activity.capacity}` : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-ivory/10">
        <div className="bg-ink px-4 py-3">
          <p className="text-3xl font-bold tabular-nums">
            {minutes}:{String(seconds).padStart(2, "0")}
          </p>
          <p className="flex items-center gap-1 text-xs text-ivory/60"><ClockIcon className="h-3.5 w-3.5" />verified</p>
        </div>
        <div className="bg-ink px-4 py-3">
          <p className="text-3xl font-bold tabular-nums text-jasmine">+{participation.pendingPoints}</p>
          <p className="flex items-center gap-1 text-xs text-ivory/60"><CoinIcon className="h-3.5 w-3.5" />when you leave</p>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-3" role="status">
        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.dot}`} />
        <p className="min-w-0 flex-1 truncate text-sm">{status.text}</p>
        {status.action ? (
          <button type="button" onClick={status.action.run} className="rounded-full bg-jasmine px-3 py-1 text-xs font-bold text-ink">
            {status.action.label}
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Directions"
          title="Directions"
          onClick={() => requestRoute(activity.placeId)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-ivory/10 hover:bg-ivory/20"
        >
          <GoIcon className="h-4 w-4" />
        </button>
        {isHost ? (
          <button
            type="button"
            aria-label="End activity"
            title="End for everyone"
            disabled={busy}
            onClick={() => act(`/api/activities/${activity.id}/end`, "End this activity for everyone?")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            <StopIcon className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Leave"
            title="Leave"
            disabled={busy}
            onClick={() => act(`/api/activities/${activity.id}/leave`)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-ivory text-ink hover:bg-white disabled:opacity-50"
          >
            <ExitIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {message ? <p className="px-4 pb-3 text-sm text-red-300">{message}</p> : null}
    </section>
  );
}

const DURATIONS = [
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "2h", minutes: 120 },
  { label: "3h", minutes: 180 },
  { label: "∞", minutes: 0 },
];

function HostForm({ initialCategory, onDone }: { initialCategory: Activity["category"]; onDone: () => void }) {
  const { position } = useUserLocation();
  const { selectedPlaceId, flyTo } = useMapStore();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Activity["category"]>(initialCategory);
  const [durationMin, setDurationMin] = useState(60);
  const [capacity, setCapacity] = useState("");
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Suggestions: the place selected on the map first, then the nearest. Typing searches by name.
  const lat = position?.lat;
  const lng = position?.lng;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        const q = query.trim();
        const params = new URLSearchParams();
        let path: string;
        if (q) {
          params.set("q", q);
          path = `/api/places?${params}`;
        } else {
          if (selectedPlaceId) params.set("placeId", selectedPlaceId);
          if (lat !== undefined && lng !== undefined) {
            params.set("lat", lat.toFixed(5));
            params.set("lng", lng.toFixed(5));
          }
          path = `/api/activities/places?${params}`;
        }
        try {
          const result = await apiFetch(path, { schema: PlaceList, signal: controller.signal });
          setPlaces(result);
          setPlaceId((current) => (current && result.some((p) => p.id === current) ? current : (result[0]?.id ?? null)));
        } catch (cause) {
          if (!controller.signal.aborted) setMessage(errorText(cause));
        }
      },
      query ? 250 : 0,
    );
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // Re-suggest when the selection changes, not on every GPS jitter.
  }, [query, selectedPlaceId, lat === undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!placeId) return setMessage("Pick a place");
    setBusy(true);
    setMessage(null);
    try {
      const created = await apiFetch("/api/activities", {
        method: "POST",
        schema: ActivitySchema,
        body: {
          title: title.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          placeId,
          category,
          ...(durationMin ? { endsAt: new Date(Date.now() + durationMin * 60_000).toISOString() } : {}),
          ...(capacity ? { capacity: Number(capacity) } : {}),
        },
      });
      await refreshFeed();
      if (created.placeCenter) flyTo(created.placeCenter);
      onDone();
    } catch (cause) {
      setMessage(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-xl border-0 bg-linen px-3 py-2.5 text-ink placeholder:text-yale/50 focus:outline-2 focus:outline-ink";
  const chip = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${on ? "bg-ink text-ivory" : "bg-linen text-ink hover:bg-ash/50"}`;
  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-ink/10">
      <div className="flex items-center gap-3">
        <CategoryBubble category={category} size={44} />
        <input
          required
          autoFocus
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-0 flex-1 border-0 bg-transparent text-lg font-bold text-ink outline-none placeholder:text-yale/40"
          placeholder="What's happening?"
          aria-label="Title"
        />
        <button type="button" onClick={onDone} aria-label="Cancel" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linen text-yale">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex justify-between gap-1" role="group" aria-label="Category">
        {ActivityCategory.options.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={c === category}
            aria-label={CATEGORY_LABELS[c]}
            title={CATEGORY_LABELS[c]}
            onClick={() => setCategory(c)}
            className={`flex h-11 w-11 items-center justify-center rounded-full transition ${c === category ? "scale-110 ring-2 ring-ink" : "opacity-60 hover:opacity-100"}`}
            style={{ backgroundColor: tint(c) }}
          >
            <CatIcon category={c} className="h-5 w-5" />
          </button>
        ))}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-yale"><PinIcon className="h-3.5 w-3.5" />Where</legend>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={input}
          placeholder={selectedPlaceId ? "Selected on the map, or search…" : "Nearby, or search…"}
        />
        <div className="flex flex-wrap gap-1.5">
          {places === null ? <span className="text-yale">Loading…</span> : null}
          {places?.length === 0 ? <span className="text-yale">No places match.</span> : null}
          {places?.map((p) => (
            <button key={p.id} type="button" aria-pressed={p.id === placeId} onClick={() => setPlaceId(p.id)} className={chip(p.id === placeId)}>
              <span className="inline-flex items-center gap-1">
                {p.id === selectedPlaceId ? <PinIcon className="h-3.5 w-3.5" /> : null}
                {p.name}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-end gap-4">
        <fieldset>
          <legend className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-yale"><ClockIcon className="h-3.5 w-3.5" />How long</legend>
          <div className="flex gap-1.5">
            {DURATIONS.map((d) => (
              <button
                key={d.minutes}
                type="button"
                aria-pressed={durationMin === d.minutes}
                aria-label={d.minutes ? `Ends in ${d.label}` : "No end time"}
                onClick={() => setDurationMin(d.minutes)}
                className={chip(durationMin === d.minutes)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block w-24">
          <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-yale"><UsersIcon className="h-3.5 w-3.5" />Max</span>
          <input
            type="number"
            min={1}
            max={500}
            inputMode="numeric"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className={input}
            placeholder="∞"
          />
        </label>
      </div>

      <textarea
        maxLength={500}
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className={input}
        placeholder="Add a note (optional)"
        aria-label="Description"
      />

      {message ? <p className="text-red-600">{message}</p> : null}
      <button
        type="submit"
        disabled={busy || !title.trim() || !placeId}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 font-semibold text-ivory disabled:opacity-40"
      >
        {busy ? "Starting…" : <>Go live <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden /></>}
      </button>
    </form>
  );
}
