import type { Weekday } from "@/shared/contracts";

/** Campus time zone: classes entered by hand are in local time here. */
export const CAMPUS_TZ = "America/New_York";

const WEEKDAYS: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

interface LocalParts { y: number; m: number; d: number; hh: number; mm: number; weekday: Weekday }

/** Calendar date, time and weekday of an instant in `tz`. */
export function localParts(at: Date, tz = CAMPUS_TZ): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short",
  });
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  const weekday = WEEKDAYS[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday)];
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, weekday };
}

function offsetMinutes(utcMs: number, tz: string): number {
  const p = localParts(new Date(utcMs), tz);
  return (Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - Math.floor(utcMs / 60_000) * 60_000) / 60_000;
}

/** The instant when the wall clock in `tz` reads y-m-d hh:mm (DST-safe). */
export function zonedTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, tz = CAMPUS_TZ): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - offsetMinutes(guess, tz) * 60_000;
  const second = guess - offsetMinutes(first, tz) * 60_000;
  return new Date(second);
}

/** Each local calendar date from `from` to `to` (inclusive), with its weekday. */
export function localDays(from: Date, to: Date, tz = CAMPUS_TZ): { y: number; m: number; d: number; weekday: Weekday }[] {
  const out: { y: number; m: number; d: number; weekday: Weekday }[] = [];
  const start = localParts(from, tz);
  const end = localParts(to, tz);
  const endKey = end.y * 10_000 + end.m * 100 + end.d;
  // walk whole days at noon UTC of each local date, which never crosses a date line here
  for (let t = Date.UTC(start.y, start.m - 1, start.d, 12); ; t += 86_400_000) {
    const day = new Date(t);
    const [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
    if (y * 10_000 + m * 100 + d > endKey) break;
    out.push({ y, m, d, weekday: WEEKDAYS[day.getUTCDay()] });
    if (out.length > 400) break;
  }
  return out;
}

/**
 * `count` consecutive campus-local dates ("YYYY-MM-DD"), the first being the date of `from`.
 * Steps by calendar date, not by 24 hours: on the Sunday a clock changes the day is 23 or 25
 * hours long, so adding whole days to an instant late on the Saturday evening skips that Sunday.
 */
export function localDayKeys(from: Date, count: number, tz = CAMPUS_TZ): string[] {
  const s = localParts(from, tz);
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(s.y, s.m - 1, s.d + i, 12)).toISOString().slice(0, 10));
}
