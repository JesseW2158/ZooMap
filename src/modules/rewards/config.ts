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
    /** Most `time-at-activity` can pay one user in one calendar day, in points. */
    perDayCap: 600,
  },
  /** How many ledger entries and redemptions `GET /api/rewards/me` returns. */
  recentLimit: 20,
} as const;

export function pointsPerMinute(): number {
  return env().pointsPerMinute;
}
