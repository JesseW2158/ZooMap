/**
 * Calendar-day boundaries in a named time zone, with no date library. Handles DST: the
 * offset is measured at the instant itself, then re-measured at the computed midnight.
 */

function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

/** Milliseconds the zone is ahead of UTC at `date` (negative west of Greenwich). */
function offsetMs(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant local midnight began, on the calendar day that contains `date` in `timeZone`. */
export function startOfDay(date: Date, timeZone: string): Date {
  const { y, m, d } = partsIn(date, timeZone);
  const midnightAsUtc = Date.UTC(y, m - 1, d);
  let guess = midnightAsUtc - offsetMs(date, timeZone);
  guess = midnightAsUtc - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

/** The instant the next local day begins. */
export function startOfNextDay(date: Date, timeZone: string): Date {
  const start = startOfDay(date, timeZone);
  // 26 hours always lands inside the next local day, even across a DST change.
  return startOfDay(new Date(start.getTime() + 26 * 3_600_000), timeZone);
}
