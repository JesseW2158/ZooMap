/** Planned-event rules, pure so they are unit-tested without a database. */

/** An event this size is announced to everyone. Same thresholds as a big activity. */
export const BIG_CAPACITY = 50;
export const BIG_CROWD = 15;

export function isBigEvent(capacity: number | undefined, goingCount: number): boolean {
  return (capacity ?? 0) >= BIG_CAPACITY || goingCount >= BIG_CROWD;
}

/** How far ahead an event may be announced, how long it may last, and how many one host may have coming up. */
export const MAX_AHEAD_MS = 90 * 24 * 3_600_000;
export const MAX_LENGTH_MS = 24 * 3_600_000;
export const DEFAULT_LENGTH_MS = 2 * 3_600_000;
export const MAX_UPCOMING_PER_HOST = 5;

/** The start and end to store, or a reason the times are not allowed. */
export function checkTimes(startsAt: Date, endsAt: Date | undefined, now: Date): { startsAt: Date; endsAt: Date } | string {
  if (Number.isNaN(startsAt.getTime())) return "startsAt: not a time";
  if (startsAt.getTime() <= now.getTime()) return "startsAt: must be in the future";
  if (startsAt.getTime() > now.getTime() + MAX_AHEAD_MS) return "startsAt: at most 90 days ahead";
  const end = endsAt ?? new Date(startsAt.getTime() + DEFAULT_LENGTH_MS);
  if (end.getTime() <= startsAt.getTime()) return "endsAt: must be after the start";
  if (end.getTime() - startsAt.getTime() > MAX_LENGTH_MS) return "endsAt: an event lasts at most 24 hours";
  return { startsAt, endsAt: end };
}
