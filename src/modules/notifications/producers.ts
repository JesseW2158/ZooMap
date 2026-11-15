import type { Activity, AlertKind, ScheduleEvent } from "@/shared/contracts";
import { classifyTitle } from "./classify";
import { DAY, HOUR, MIN, clock, dayName, eventDate, localAt, localParts, sameLocalDay } from "./time";

/**
 * Time-based alerts. Each producer is a function of its inputs and `now`, so nothing is stored
 * until an alert is due; then the service saves it under `key`, which names its cause, so it is
 * saved once however often the inbox is polled.
 */
export interface Candidate {
  /** Unique per user and cause, e.g. "exam:<eventId>:3d". */
  key: string;
  kind: AlertKind;
  title: string;
  body: string;
  fireAt: Date;
  /** After this the alert is no use (the class started, the gap is over) and is not shown. */
  staleAt: Date;
  placeId?: string;
}

const s = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function label(e: ScheduleEvent): string {
  if (!e.course) return e.title;
  const flat = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  return flat(e.title).includes(flat(e.course)) ? e.title : `${e.course} ${e.title}`;
}

function when(e: ScheduleEvent, start: Date): string {
  const day = dayName(start, e.allDay);
  return e.allDay ? day : `${day}, ${clock(start)}`;
}

// ---------------------------------------------------------------- exams, projects, deadlines

/** Days before, at 9am local. Exams also get a reminder 2 hours before a timed start. */
const PLAN: Record<"exam" | "quiz" | "project" | "assignment", number[]> = {
  exam: [7, 3, 1],
  quiz: [1],
  project: [3, 1],
  assignment: [1],
};

export function workAlerts(events: ScheduleEvent[], now: Date): Candidate[] {
  const out: Candidate[] = [];
  for (const e of events) {
    if (e.skipped) continue;
    const work = classifyTitle(e.title, e.deadline === true);
    if (!work) continue;
    const start = new Date(e.start);
    if (start.getTime() <= now.getTime()) continue;
    const kind: AlertKind = work === "exam" || work === "quiz" ? "exam" : work;
    const name = label(e);
    const where = e.locationText && !e.deadline ? ` · ${e.locationText}` : "";
    const verb = e.deadline ? "Due" : "";
    const date = eventDate(start, e.allDay);

    for (const days of PLAN[work]) {
      const fireAt = localAt(date, days, 9);
      if (fireAt.getTime() >= start.getTime()) continue;
      const lead = days === 1 ? "tomorrow" : `in ${days} days`;
      out.push({
        key: `${kind}:${e.id}:${days}d`,
        kind,
        title: e.deadline ? `${name} is due ${lead}` : `${name} ${lead}`,
        body: `${verb ? `${verb} ` : ""}${when(e, start)}${where}`,
        fireAt,
        staleAt: new Date(Math.min(fireAt.getTime() + 12 * HOUR, start.getTime())),
        placeId: e.deadline ? undefined : e.placeId,
      });
    }
    if (work === "exam" && !e.allDay && !e.deadline) {
      const fireAt = new Date(start.getTime() - 2 * HOUR);
      out.push({
        key: `exam:${e.id}:2h`,
        kind,
        title: `${name} in 2 hours`,
        body: `${clock(start)}${where}. Good luck!`,
        fireAt,
        staleAt: start,
        placeId: e.placeId,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- leave for class

/** Things to walk to: timed classes and plans at a known place. */
function isStop(e: ScheduleEvent): e is ScheduleEvent & { placeId: string } {
  return !e.deadline && !e.allDay && !e.skipped && Boolean(e.placeId);
}

export const DEFAULT_WALK_MIN = 10;

export type WalkMinutes = (fromPlaceId: string, toPlaceId: string) => Promise<number | null>;

export async function leaveByAlerts(events: ScheduleEvent[], now: Date, leadMin: number, walk: WalkMinutes): Promise<Candidate[]> {
  const stops = events.filter(isStop).sort((a, b) => a.start.localeCompare(b.start));
  const out: Candidate[] = [];
  for (let i = 0; i < stops.length; i++) {
    const e = stops[i];
    const start = new Date(e.start);
    if (start.getTime() <= now.getTime() || start.getTime() > now.getTime() + DAY) continue;

    // walk from the previous stop that day, when there is one
    const prev = stops
      .slice(0, i)
      .filter((p) => new Date(p.end).getTime() <= start.getTime() && sameLocalDay(new Date(p.end), start))
      .at(-1);
    let minutes = DEFAULT_WALK_MIN;
    let known = false;
    if (prev) {
      if (prev.placeId === e.placeId) continue; // same building, nothing to walk
      const w = await walk(prev.placeId, e.placeId);
      if (w !== null) {
        minutes = Math.max(1, Math.round(w));
        known = true;
      }
    }
    const leaveAt = new Date(start.getTime() - (minutes + 2) * MIN);
    out.push({
      key: `leave-by:${e.id}`,
      kind: "leave-by",
      title: `Leave by ${clock(leaveAt)} for ${label(e)}`,
      body: `${e.locationText ?? "Class"} at ${clock(start)} · ${known ? "" : "about "}${minutes} min walk${prev && known ? ` from ${prev.course ?? prev.title}` : ""}`,
      fireAt: new Date(leaveAt.getTime() - leadMin * MIN),
      staleAt: start,
      placeId: e.placeId,
    });
  }
  return out;
}

// ---------------------------------------------------------------- quiet room in a free gap

export interface StudySpot {
  placeId: string;
  name: string;
  /** 0 empty .. 4 packed. */
  level: number;
  simulated: boolean;
}

export const MIN_GAP_MIN = 30;

export interface QuietRoomDeps {
  /** Study places with their crowd level at `at`. */
  spotsAt(at: Date): Promise<StudySpot[]>;
  walk: WalkMinutes;
}

const LEVEL_WORD = ["empty", "quiet", "a little busy", "busy", "packed"];

export async function quietRoomAlerts(events: ScheduleEvent[], now: Date, deps: QuietRoomDeps): Promise<Candidate[]> {
  const stops = events.filter(isStop).sort((a, b) => a.start.localeCompare(b.start));
  const exams = events.filter((e) => !e.skipped && classifyTitle(e.title, e.deadline === true) === "exam");
  const out: Candidate[] = [];

  for (let i = 0; i + 1 < stops.length; i++) {
    const prev = stops[i];
    const next = stops[i + 1];
    const gapStart = new Date(prev.end);
    const gapEnd = new Date(next.start);
    const gapMin = (gapEnd.getTime() - gapStart.getTime()) / MIN;
    if (gapMin < MIN_GAP_MIN || !sameLocalDay(gapStart, gapEnd)) continue;
    if (gapEnd.getTime() <= now.getTime() || gapStart.getTime() > now.getTime() + DAY) continue;
    const hour = localParts(gapStart).hh;
    if (hour < 7 || hour >= 21) continue;

    const spots = await deps.spotsAt(gapStart.getTime() > now.getTime() ? gapStart : now);
    let best: { spot: StudySpot; there: number; on: number; score: number } | null = null;
    for (const spot of spots) {
      const there = spot.placeId === prev.placeId ? 0 : await deps.walk(prev.placeId, spot.placeId);
      const on = spot.placeId === next.placeId ? 0 : await deps.walk(spot.placeId, next.placeId);
      if (there === null || on === null) continue;
      // leave at least 20 minutes to sit down and study
      if (there + on + 20 > gapMin) continue;
      const score = spot.level * 6 + there + on;
      if (!best || score < best.score) best = { spot, there: Math.round(there), on: Math.round(on), score };
    }
    if (!best) continue;

    const soonExam = exams.find((x) => {
      const t = new Date(x.start).getTime();
      return t > gapStart.getTime() && t - gapStart.getTime() <= 3 * DAY;
    });
    const quiet = best.spot.level <= 1 ? `is ${LEVEL_WORD[best.spot.level]}` : "is the quietest nearby";
    out.push({
      key: `quiet-room:${prev.id}:${next.id}`,
      kind: "quiet-room",
      title: `Free until ${clock(gapEnd)}: ${best.spot.name} ${quiet}`,
      body: [
        `${best.there} min from ${prev.course ?? prev.title}, ${best.on} min to ${next.course ?? next.title}.`,
        soonExam ? `Good time to study for ${soonExam.course ?? soonExam.title}.` : "",
        best.spot.simulated ? "Crowd level is simulated." : "",
      ]
        .filter(Boolean)
        .join(" "),
      fireAt: gapStart,
      staleAt: new Date(gapEnd.getTime() - 15 * MIN),
      placeId: best.spot.placeId,
    });
  }
  return out;
}

// ---------------------------------------------------------------- big events

/** An activity this size counts as a big event. */
export const BIG_CAPACITY = 50;
export const BIG_CROWD = 15;

export function bigEventAlerts(activities: Activity[], userId: string): Candidate[] {
  const out: Candidate[] = [];
  for (const a of activities) {
    if (a.status !== "active" || a.hostId === userId) continue;
    if ((a.capacity ?? 0) < BIG_CAPACITY && a.participantCount < BIG_CROWD) continue;
    const started = new Date(a.startedAt);
    out.push({
      key: `big-event:${a.id}`,
      kind: "big-event",
      title: `Big event on now: ${a.title}`,
      body: `${a.placeName ?? "On campus"} · ${s(a.participantCount, "person")} going`.replace("persons", "people"),
      fireAt: started,
      staleAt: a.endsAt ? new Date(a.endsAt) : new Date(started.getTime() + 6 * HOUR),
      placeId: a.placeId,
    });
  }
  return out;
}
