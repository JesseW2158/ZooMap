import type { EventPayload } from "@/shared/contracts";
import { getCollections } from "@/shared/db";
import { REWARDS_CONFIG } from "./config";
import { runRules } from "./engine";
import { ledgerKeyExists } from "./ledger";
import { timeAtActivityKey } from "./rules/time-at-activity";

/** Rewards counts as a participation's minutes only from this many verified seconds (one paid minute). */
const MIN_VERIFIED_SECONDS = 60;

/**
 * Lazy settlement of points that were never paid.
 *
 * `participation.ended` is emitted once, right after the participation flips to "ended". If
 * that emit is lost (the process dies between the flip and the emit) or the rule fails (a
 * database error is logged and skipped), nothing pays and nothing retries: there are no
 * background jobs on Vercel. So any later request for the user calls this, and it pays what
 * is still owed:
 *
 *  1. find the user's participations that ended between `lookbackMs` and `graceMs` ago with
 *     at least a minute verified;
 *  2. drop those that already have their `participation:<id>:time` ledger entry;
 *  3. run the normal rules for the rest, exactly as the event would have.
 *
 * Exactly once: the ledger key is unique, so a concurrent settle, a late original event or a
 * repeat call writes nothing new (`applyEntry` treats an existing key as success).
 *
 * The rules run with `now` set to when the participation ended, so the repaired entry is
 * dated to the day the points were earned and is judged against that day's cap. That keeps a
 * participation that was capped to zero the first time at zero (it has no ledger entry,
 * so it is looked at again, but the same cap applies); the cap can only have filled up since,
 * never emptied, so a repair never pays more than the original run would have.
 *
 * Never throws: a failure is logged and the next request tries again. Returns the number of
 * participations it paid something for.
 */
export async function settleUnpaid(userId: string, now: Date = new Date()): Promise<number> {
  try {
    const { settle } = REWARDS_CONFIG;
    const { participations } = await getCollections();
    const candidates = await participations
      .find({
        userId,
        status: "ended",
        verifiedSeconds: { $gte: MIN_VERIFIED_SECONDS },
        leftAt: { $gte: new Date(now.getTime() - settle.lookbackMs), $lte: new Date(now.getTime() - settle.graceMs) },
      })
      .sort({ leftAt: 1, _id: 1 })
      .toArray();
    let paid = 0;
    let handled = 0;
    for (const p of candidates) {
      if (!p.leftAt || (await ledgerKeyExists(timeAtActivityKey(p._id)))) continue;
      if (++handled > settle.batch) break;
      const event: EventPayload<"participation.ended"> = {
        participationId: p._id,
        activityId: p.activityId,
        userId: p.userId,
        role: p.role,
        joinedAt: p.joinedAt,
        endedAt: p.leftAt,
        verifiedSeconds: p.verifiedSeconds,
      };
      const applied = await runRules("participation.ended", event, undefined, p.leftAt);
      if (applied.some((a) => a.created)) paid++;
    }
    return paid;
  } catch (error) {
    console.error("[rewards] settling unpaid points failed", error);
    return 0;
  }
}
