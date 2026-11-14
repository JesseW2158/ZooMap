"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
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

/** Activities: the one you are in (with verified time), a host form, and every active activity, nearest first. */
export function ActivitiesPanel() {
  const { activities, me, sharing, error } = useActivitiesFeed();
  const { position } = useUserLocation();
  const [hosting, setHosting] = useState(false);
  const inActivity = !!me?.participation;

  const sorted = useMemo(() => {
    const list = [...(activities ?? [])];
    const dist = (a: Activity) => (position && a.placeCenter ? haversineM(position, a.placeCenter) : Infinity);
    return list.sort((a, b) => dist(a) - dist(b) || b.startedAt.localeCompare(a.startedAt));
  }, [activities, position]);

  return (
    <div className="space-y-4 text-sm">
      {inActivity && me?.activity ? <CurrentActivity me={me} sharing={sharing} /> : null}

      {!inActivity ? (
        hosting ? (
          <HostForm onDone={() => setHosting(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setHosting(true)}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white"
          >
            Host an activity
          </button>
        )
      ) : null}

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Happening now</h2>
        {error ? <p className="text-red-600">{error}</p> : null}
        {activities === null && !error ? <p className="text-neutral-500">Loading…</p> : null}
        {activities?.length === 0 ? (
          <p className="text-neutral-500">Nothing is happening right now. Host something!</p>
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

function errorText(cause: unknown): string {
  return cause instanceof ApiClientError ? cause.message : "Something went wrong";
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

function minutesAgo(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h ${min % 60} min ago`;
}

function CategoryBadge({ category }: { category: Activity["category"] }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: CATEGORY_COLORS[category] }}
    >
      {CATEGORY_LABELS[category]}
    </span>
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
      className={`rounded-xl border p-3 ${
        mine ? "border-emerald-500 bg-emerald-50" : a.placeId === selectedPlaceId ? "border-amber-400" : "border-neutral-200"
      }`}
    >
      <button
        type="button"
        className="block w-full text-left"
        onClick={() => {
          selectPlace(a.placeId);
          if (a.placeCenter) flyTo(a.placeCenter);
        }}
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-semibold">{a.title}</span>
          <CategoryBadge category={a.category} />
        </div>
        <p className="mt-0.5 text-neutral-600">
          {a.placeName ?? a.placeId}
          {distance !== null ? ` · ${formatDistance(distance)}` : ""}
        </p>
        <p className="text-xs text-neutral-500">
          {a.participantCount}
          {a.capacity ? ` / ${a.capacity}` : ""} {a.participantCount === 1 ? "person" : "people"} · hosted by {a.hostName} ·{" "}
          started {minutesAgo(a.startedAt)}
          {a.endsAt ? ` · ends ${new Date(a.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
        </p>
        {a.description ? <p className="mt-1 text-neutral-700">{a.description}</p> : null}
      </button>
      <div className="mt-2 flex gap-2">
        {canJoin ? (
          <button
            type="button"
            disabled={busy || full}
            onClick={join}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white disabled:opacity-50"
          >
            {full ? "Full" : busy ? "Joining…" : "Join"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => requestRoute(a.placeId)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 font-medium"
        >
          Route there
        </button>
      </div>
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

  let status: { tone: string; text: string; action?: { label: string; run: () => void } };
  if (sharing === false) {
    status = {
      tone: "border-amber-300 bg-amber-50 text-amber-900",
      text: "Location sharing is off, so no time is counting.",
      action: { label: "Turn on sharing", run: turnOnSharing },
    };
  } else if (participation.verifying) {
    status = { tone: "border-emerald-300 bg-emerald-100 text-emerald-900", text: "You're at the location. Time is counting." };
  } else {
    status = {
      tone: "border-neutral-300 bg-neutral-100 text-neutral-800",
      text:
        `Not at the location, so no time is counting. Get within ${GEOFENCE_M} m of ${activity.placeName ?? "the place"}` +
        (distance !== null && distance > GEOFENCE_M ? ` (you're about ${formatDistance(distance)} away).` : "."),
    };
  }

  return (
    <section className="space-y-3 rounded-2xl border-2 border-emerald-500 p-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">{isHost ? "You're hosting" : "You're in"}</p>
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{activity.title}</h2>
          <CategoryBadge category={activity.category} />
        </div>
        <p className="text-neutral-600">
          {activity.placeName ?? activity.placeId} · {activity.participantCount}
          {activity.capacity ? ` / ${activity.capacity}` : ""} {activity.participantCount === 1 ? "person" : "people"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-neutral-50 p-2">
          <p className="text-2xl font-bold tabular-nums">
            {minutes}:{String(seconds).padStart(2, "0")}
          </p>
          <p className="text-xs text-neutral-500">verified minutes</p>
        </div>
        <div className="rounded-xl bg-neutral-50 p-2">
          <p className="text-2xl font-bold tabular-nums">+{participation.pendingPoints}</p>
          <p className="text-xs text-neutral-500">points when you leave</p>
        </div>
      </div>

      <div className={`rounded-xl border p-2 ${status.tone}`} role="status">
        <p>{status.text}</p>
        {status.action ? (
          <button type="button" onClick={status.action.run} className="mt-1 font-semibold underline">
            {status.action.label}
          </button>
        ) : null}
      </div>
      <p className="text-xs text-neutral-500">Daily and per-activity point caps apply when the points are paid.</p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => requestRoute(activity.placeId)}
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 font-medium"
        >
          Route there
        </button>
        {isHost ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => act(`/api/activities/${activity.id}/end`, "End this activity for everyone?")}
            className="flex-1 rounded-lg bg-red-600 px-3 py-2 font-medium text-white disabled:opacity-50"
          >
            End activity
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => act(`/api/activities/${activity.id}/leave`)}
            className="flex-1 rounded-lg bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50"
          >
            Leave
          </button>
        )}
      </div>
      {message ? <p className="text-red-600">{message}</p> : null}
    </section>
  );
}

const DURATIONS = [
  { label: "No end time", minutes: 0 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "3 hours", minutes: 180 },
];

function HostForm({ onDone }: { onDone: () => void }) {
  const { position } = useUserLocation();
  const { selectedPlaceId, flyTo } = useMapStore();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Activity["category"]>("study");
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

  const input = "w-full rounded-lg border border-neutral-300 px-3 py-2";
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-neutral-200 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Host an activity</h2>
        <button type="button" onClick={onDone} className="text-neutral-500 underline">
          Cancel
        </button>
      </div>

      <label className="block space-y-1">
        <span className="font-medium">Title</span>
        <input required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} className={input} placeholder="Calc II study group" />
      </label>

      <fieldset className="space-y-1">
        <legend className="font-medium">Place</legend>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={input}
          placeholder={selectedPlaceId ? "Selected on the map, or search…" : "Nearby, or search…"}
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {places === null ? <span className="text-neutral-500">Loading places…</span> : null}
          {places?.length === 0 ? <span className="text-neutral-500">No places match.</span> : null}
          {places?.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === placeId}
              onClick={() => setPlaceId(p.id)}
              className={`rounded-full border px-3 py-1 ${
                p.id === placeId ? "border-emerald-600 bg-emerald-600 text-white" : "border-neutral-300"
              }`}
            >
              {p.name}
              {p.id === selectedPlaceId ? " (selected)" : ""}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="font-medium">Category</legend>
        <div className="flex flex-wrap gap-1.5">
          {ActivityCategory.options.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={c === category}
              onClick={() => setCategory(c)}
              className="rounded-full border px-3 py-1"
              style={c === category ? { backgroundColor: CATEGORY_COLORS[c], borderColor: CATEGORY_COLORS[c], color: "white" } : undefined}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="font-medium">Ends</span>
          <select value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} className={input}>
            {DURATIONS.map((d) => (
              <option key={d.minutes} value={d.minutes}>
                {d.minutes ? `in ${d.label}` : d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="font-medium">Capacity</span>
          <input
            type="number"
            min={1}
            max={500}
            inputMode="numeric"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className={input}
            placeholder="No limit"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="font-medium">Description (optional)</span>
        <textarea maxLength={500} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={input} />
      </label>

      {message ? <p className="text-red-600">{message}</p> : null}
      <button
        type="submit"
        disabled={busy || !title.trim() || !placeId}
        className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Starting…" : "Start activity"}
      </button>
    </form>
  );
}
