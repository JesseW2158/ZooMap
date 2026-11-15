/**
 * Campus time (America/New_York) whatever zone the server runs in. Gemini is told the current
 * campus date and time and picks its own date ranges; these helpers state "now" and give the
 * keyword fallback simple ranges ("tonight", "tomorrow", "this weekend").
 */

export const CAMPUS_TZ = "America/New_York";
const DAY_MS = 24 * 3_600_000;
export const MAX_AHEAD_MS = 90 * DAY_MS;

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface CampusParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 Sunday … 6 Saturday */
  weekday: number;
}

export function campusParts(d: Date): CampusParts {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

/** Campus offset from UTC at that instant, in ms (negative in Amherst). */
function offsetMs(d: Date): number {
  const p = campusParts(d);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000;
}

/** The instant of a campus wall-clock time. Day overflow is fine (day 32 is next month). DST-safe. */
export function campusTime(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let t = wall - offsetMs(new Date(wall));
  t = wall - offsetMs(new Date(t));
  return new Date(t);
}

/** "Saturday, November 14, 2026, 3:05 PM" */
export function describeNow(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TZ,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(d)
    .replace(/\s/g, " "); // ICU puts a narrow no-break space before AM/PM
}

/** "Sat, Nov 21, 7:00 PM" */
export function formatCampus(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    .format(d)
    .replace(/\s/g, " ");
}

/** The UTC offset at `d` as "-05:00", so Gemini can write ISO times in campus time. */
export function offsetLabel(d: Date): string {
  const mins = Math.round(offsetMs(d) / 60_000);
  const sign = mins < 0 ? "-" : "+";
  const a = Math.abs(mins);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

export interface Range {
  from: Date;
  to: Date;
  label: string;
}

/**
 * A range from Gemini's ISO arguments, kept sane: not before now, at most 90 days ahead,
 * and the next seven days when either end is missing or unreadable.
 */
export function clampRange(now: Date, from?: unknown, to?: unknown): Range {
  const parse = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(Date.parse(v)) : null);
  const max = now.getTime() + MAX_AHEAD_MS;
  let f = parse(from)?.getTime() ?? now.getTime();
  let t = parse(to)?.getTime() ?? f + 7 * DAY_MS;
  f = Math.min(Math.max(f, now.getTime()), max);
  t = Math.min(t, max);
  if (t <= f) t = Math.min(f + DAY_MS, max);
  return { from: new Date(f), to: new Date(t), label: `${formatCampus(new Date(f))} to ${formatCampus(new Date(t))}` };
}

/** For the keyword fallback: the range a question is about. The next seven days by default. */
export function rangeFromText(text: string, now: Date): Range {
  const t = text.toLowerCase();
  const p = campusParts(now);
  const at = (dayOffset: number, hour = 0) => campusTime(p.year, p.month, p.day + dayOffset, hour);

  if (/\b(tonight|today|this evening|later today)\b/.test(t)) return { from: now, to: at(1), label: /tonight|evening/.test(t) ? "tonight" : "today" };
  if (/\btomorrow\b/.test(t)) return { from: at(1), to: at(2), label: "tomorrow" };
  if (/\bweekend\b/.test(t)) {
    const toMonday = (8 - p.weekday) % 7 || 7;
    const inWeekend = p.weekday === 6 || p.weekday === 0 || (p.weekday === 5 && p.hour >= 17);
    const from = inWeekend ? now : at(5 - p.weekday, 17);
    return { from, to: at(toMonday), label: "this weekend" };
  }
  return { from: now, to: new Date(now.getTime() + 7 * DAY_MS), label: "in the next 7 days" };
}
