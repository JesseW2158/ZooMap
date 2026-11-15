import type { LedgerDraft, RewardRule } from "@/shared/contracts";
import { REWARDS_CONFIG, pointsPerMinute } from "../config";
import { describeActivity } from "../describe";
import { startOfDay, startOfNextDay } from "../time";

export const TIME_AT_ACTIVITY = "time-at-activity";

/**
 * Pure: points for one participation, after both caps.
 * `alreadyToday` is what this rule has already paid the user on the same calendar day.
 */
export function timeAtActivityPoints(input: {
  verifiedSeconds: number;
  perMinute: number;
  alreadyToday: number;
  perParticipationCap?: number;
  perDayCap?: number;
}): number {
  const { perParticipationCap = REWARDS_CONFIG.timeAtActivity.perParticipationCap, perDayCap = REWARDS_CONFIG.timeAtActivity.perDayCap } =
    input;
  const raw = Math.floor(Math.max(0, input.verifiedSeconds) / 60) * Math.max(0, input.perMinute);
  const capped = Math.min(raw, perParticipationCap);
  const roomToday = Math.max(0, perDayCap - Math.max(0, input.alreadyToday));
  return Math.min(capped, roomToday);
}

/**
 * Pays for location-verified minutes at an activity when the participation ends.
 * Hosts and guests are paid alike. The daily cap counts the America/New_York day the points
 * are PAID (`ctx.now`), the same clock the ledger's `createdAt` uses. Settling is lazy, so a
 * participation that ends at 11:58 pm and settles at 12:01 am counts toward the new day.
 */
export const timeAtActivity: RewardRule<"participation.ended"> = {
  id: TIME_AT_ACTIVITY,
  on: "participation.ended",
  async evaluate(event, ctx): Promise<LedgerDraft[]> {
    const idempotencyKey = `participation:${event.participationId}:time`;
    const { timeZone } = REWARDS_CONFIG;
    const dayStart = startOfDay(ctx.now, timeZone);
    const dayEnd = startOfNextDay(ctx.now, timeZone);

    const today = await ctx.ledgerForUser(event.userId, { since: dayStart, ruleId: TIME_AT_ACTIVITY });
    const alreadyToday = today
      .filter((e) => new Date(e.createdAt) < dayEnd && e.idempotencyKey !== idempotencyKey)
      .reduce((sum, e) => sum + e.delta, 0);

    const points = timeAtActivityPoints({ verifiedSeconds: event.verifiedSeconds, perMinute: pointsPerMinute(), alreadyToday });
    if (points <= 0) return [];

    const minutes = Math.floor(event.verifiedSeconds / 60);
    return [
      {
        userId: event.userId,
        delta: points,
        ruleId: TIME_AT_ACTIVITY,
        reason: `${minutes} min at ${await describeActivity(event.activityId)}`,
        source: { type: "participation", id: event.participationId },
        idempotencyKey,
      },
    ];
  },
};
