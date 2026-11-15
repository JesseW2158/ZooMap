"use client";

import { useState, type FormEvent } from "react";
import {
  PlaceList,
  PlannedEvent,
  type ActivityCategory,
  type Place,
} from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { mapActions } from "@/shared/ui";
import { plannedActions, usePlannedFeed } from "./feed";

/**
 * The Events tab: what is coming up on campus, with "I'm going", and a form to announce an
 * event ahead of time. Big events (50+ spots or 15+ going) are announced to everyone through
 * the alerts bell, and everyone going gets reminders.
 */

const CATEGORIES: { id: ActivityCategory; label: string }[] = [
  { id: "social", label: "Social" },
  { id: "study", label: "Study" },
  { id: "sports", label: "Sports" },
  { id: "food", label: "Food" },
  { id: "other", label: "Other" },
];

const when = (iso: string) =>
  new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function errorText(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : "Something went wrong. Try again.";
}

export function PlannedEventsPanel() {
  const { events, error } = usePlannedFeed();
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3 text-neutral-900">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Coming up on campus</h2>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="rounded-lg bg-[#881c1c] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#6f1616]"
        >
          {adding ? "Close" : "+ Announce an event"}
        </button>
      </div>

      {adding ? (
        <AnnounceForm
          onDone={(created) => {
            setAdding(false);
            plannedActions.add(created);
          }}
        />
      ) : null}

      {error ? <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
      {events === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nothing announced yet. Planning something big? Announce it so people hear about it days ahead.
        </p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id}>
              <EventCard event={e} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One event with its actions. Used in the Events tab and in the map pop-up. */
export function EventCard({ event, onRoute }: { event: PlannedEvent; onRoute?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const going = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      plannedActions.replace(
        await apiFetch(`/api/planned-events/${event.id}/going`, {
          method: "POST",
          body: { going: next },
          schema: PlannedEvent,
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/planned-events/${event.id}`, { method: "DELETE" });
      plannedActions.remove(event.id);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const full =
    event.capacity !== undefined &&
    event.goingCount >= event.capacity &&
    !event.going;

  return (
    <div
      className={`rounded-xl border p-3 ${event.going ? "border-[#881c1c]/40 bg-[#881c1c]/5" : "border-neutral-200 bg-white"}`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {event.big ? (
              <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
                BIG
              </span>
            ) : null}
            {event.title}
          </p>
          <p className="text-xs text-neutral-600">
            {when(event.startsAt)} · {event.placeName ?? "On campus"}
          </p>
          <p className="text-xs text-neutral-500">
            {event.goingCount} going
            {event.capacity ? ` of ${event.capacity}` : ""} · hosted by{" "}
            {event.hostName}
          </p>
          {event.description ? (
            <p className="mt-1 text-xs text-neutral-700">{event.description}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {event.hosting ? (
          confirmCancel ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={cancel}
                className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white"
              >
                Yes, cancel it
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs"
              >
                Keep it
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700"
            >
              Cancel event
            </button>
          )
        ) : event.going ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => going(false)}
            className="rounded-lg bg-[#881c1c] px-3 py-1.5 text-xs font-medium text-white"
          >
            ✓ Going · tap to undo
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || full}
            onClick={() => going(true)}
            className="rounded-lg border border-[#881c1c] px-3 py-1.5 text-xs font-medium text-[#881c1c] disabled:opacity-50"
          >
            {full ? "Full" : "I'm going"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            mapActions.requestRoute(event.placeId);
            onRoute?.();
          }}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
        >
          Route
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

function AnnounceForm({ onDone }: { onDone: (created: PlannedEvent) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ActivityCategory>("social");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [hours, setHours] = useState(2);
  const [capacity, setCapacity] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!place) return setError("Pick where it is.");
    if (!date) return setError("Pick a date.");
    const startsAt = new Date(`${date}T${time}`);
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch("/api/planned-events", {
        method: "POST",
        schema: PlannedEvent,
        body: {
          title,
          ...(description.trim() ? { description } : {}),
          placeId: place.id,
          category,
          startsAt: startsAt.toISOString(),
          endsAt: new Date(
            startsAt.getTime() + hours * 3_600_000,
          ).toISOString(),
          ...(capacity ? { capacity: Number(capacity) } : {}),
        },
      });
      onDone(created);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900";

  return (
    <form
      onSubmit={submit}
      className="space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm"
    >
      <input
        required
        maxLength={80}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What is it? e.g. Spring Concert"
        className={field}
      />
      <PlacePicker value={place} onChange={setPlace} />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-neutral-600">
          Date
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={field}
          />
        </label>
        <label className="text-xs text-neutral-600">
          Starts
          <input
            type="time"
            required
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={field}
          />
        </label>
        <label className="text-xs text-neutral-600">
          Lasts
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className={field}
          >
            {[1, 2, 3, 4, 6, 8].map((h) => (
              <option key={h} value={h}>
                {h} hour{h === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-600">
          Spots (optional)
          <input
            type="number"
            min={1}
            max={20000}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="e.g. 400"
            className={field}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`rounded-full border px-2.5 py-1 text-xs ${category === c.id ? "border-[#881c1c] bg-[#881c1c] text-white" : "border-neutral-300 bg-white"}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <textarea
        maxLength={500}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Details (optional)"
        rows={2}
        className={field}
      />
      <p className="text-xs text-neutral-500">
        With 50 or more spots, everyone with big-event alerts on hears about it
        now, a week before, a day before and an hour before.
      </p>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50"
      >
        {busy ? "Announcing…" : "Announce"}
      </button>
    </form>
  );
}

function PlacePicker({
  value,
  onChange,
}: {
  value: Place | null;
  onChange: (p: Place | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);

  const search = async (text: string) => {
    setQ(text);
    if (text.trim().length < 2) return setResults([]);
    try {
      setResults(
        (
          await apiFetch(`/api/places?q=${encodeURIComponent(text)}`, {
            schema: PlaceList,
          })
        ).slice(0, 6),
      );
    } catch {
      setResults([]);
    }
  };

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-neutral-300 bg-white px-2 py-1.5">
        <span>📍 {value.name}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-neutral-500 hover:text-neutral-800"
        >
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => void search(e.target.value)}
        placeholder="Where? Search a building"
        className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
      />
      {results.length ? (
        <ul className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(p);
                  setResults([]);
                }}
                className="w-full px-2 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
