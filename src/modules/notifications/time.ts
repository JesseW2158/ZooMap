/** Campus-time helpers. Alerts talk in America/New_York, whatever time zone the server runs in. */

export const CAMPUS_TZ = "America/New_York";
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export interface LocalParts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
}

export function localParts(at: Date, tz = CAMPUS_TZ): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute };
}

function offsetMinutes(utcMs: number, tz: string): number {
  const p = localParts(new Date(utcMs), tz);
  return (Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - Math.floor(utcMs / MIN) * MIN) / MIN;
}

/** The instant when the campus wall clock reads y-m-d hh:mm (DST-safe). */
export function zonedTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, tz = CAMPUS_TZ): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - offsetMinutes(guess, tz) * MIN;
  return new Date(guess - offsetMinutes(first, tz) * MIN);
}

/** The local calendar date of an event: all-day events are stored at midnight UTC of their date. */
export function eventDate(start: Date, allDay: boolean | undefined): { y: number; m: number; d: number } {
  if (allDay) return { y: start.getUTCFullYear(), m: start.getUTCMonth() + 1, d: start.getUTCDate() };
  const p = localParts(start);
  return { y: p.y, m: p.m, d: p.d };
}

/** `days` before a local date, at hh:mm local. */
export function localAt(date: { y: number; m: number; d: number }, daysBefore: number, hh: number, mm = 0): Date {
  const shifted = new Date(Date.UTC(date.y, date.m - 1, date.d - daysBefore, 12));
  return zonedTimeToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), hh, mm);
}

export function sameLocalDay(a: Date, b: Date): boolean {
  const p = localParts(a);
  const q = localParts(b);
  return p.y === q.y && p.m === q.m && p.d === q.d;
}

/** "9:58am" */
export function clock(at: Date): string {
  const p = localParts(at);
  const h = p.hh % 12 === 0 ? 12 : p.hh % 12;
  return `${h}:${String(p.mm).padStart(2, "0")}${p.hh < 12 ? "am" : "pm"}`;
}

/** "Thursday, Nov 19" */
export function dayName(at: Date, allDay?: boolean): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: allDay ? "UTC" : CAMPUS_TZ, weekday: "long", month: "short", day: "numeric" }).format(at);
}

/** Whether `at` falls inside quiet hours, which may wrap past midnight ("23:00"-"07:00"). */
export function inQuietHours(at: Date, quiet: { start: string; end: string } | null): boolean {
  if (!quiet) return false;
  const p = localParts(at);
  const now = p.hh * 60 + p.mm;
  const [sh, sm] = quiet.start.split(":").map(Number);
  const [eh, em] = quiet.end.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}
