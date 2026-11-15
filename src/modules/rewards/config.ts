import { env } from "@/shared/config/env";

/**
 * Every rewards number in one place. Change the economy here, not in the rules.
 * `POINTS_PER_MINUTE` comes from the environment so the demo can raise it.
 */
export const REWARDS_CONFIG = {
  /** Calendar days for the daily cap are counted in this zone. */
  timeZone: "America/New_York",
  timeAtActivity: {
    /** Most one participation can pay, in points. */
    perParticipationCap: 240,
    /** Most `time-at-activity` can pay one user in one calendar day (the day points are paid), in points. */
    perDayCap: 600,
  },
  /**
   * Repairing points that were never paid (see `settle.ts`). Only participations that ended
   * at least `graceMs` ago are looked at (a payment that is still in flight is left alone),
   * and only those that ended within `lookbackMs`, so the scan stays small.
   */
  settle: {
    graceMs: 60_000,
    lookbackMs: 7 * 24 * 3_600_000,
    /** Most participations repaired by one call, so one request never does unbounded work. */
    batch: 25,
  },
  /** How many ledger entries and redemptions `GET /api/rewards/me` returns. */
  recentLimit: 20,
} as const;

export function pointsPerMinute(): number {
  return env().pointsPerMinute;
}
