import type { EventPayload } from "@/shared/contracts";
import { env } from "@/shared/config/env";
import { getCollections } from "@/shared/db";
import { getPlace } from "@/modules/campus";
import { isInRange, MAX_PING_GAP_S } from "./rules";
import { settleStale } from "./settle";

/**
 * Verified time: the only input to points, so only the server computes it, from the time on
 * the `presence.updated` event (set by the server that took the ping).
 *
 * In range: if the previous in-range ping was under 300 s ago, add the gap to
 * `verifiedSeconds`; then set `lastVerifiedAt` (and `lastInRangeAt`) to now.
 * Out of range: clear `lastVerifiedAt`, so the next in-range ping starts a new run.
 * Each is one atomic update on an active participation, so it never touches an ended one and
 * two pings can never both add the same gap.
 */
export async function recordPresence(event: EventPayload<"presence.updated">): Promise<void> {
  const now = event.at;
  await settleStale(now);

  const { activities, participations } = await getCollections();
  const participation = await participations.findOne({ userId: event.userId, status: "active" });
  if (!participation) return;
  const activity = await activities.findOne({ _id: participation.activityId, status: "active" });
  if (!activity) return;

  const place = await getPlace(activity.placeId);
  const inRange = isInRange(
    { position: event.position, placeId: event.placeId },
    { placeId: activity.placeId, center: place?.center ?? null },
    env().geofenceEnforced,
  );

  const filter = { _id: participation._id, status: "active" as const };
  if (!inRange) {
    await participations.updateOne(filter, { $unset: { lastVerifiedAt: "" } });
    return;
  }

  // Milliseconds since the previous in-range ping (0 when there is none).
  const gapMs = { $subtract: [now, { $ifNull: ["$lastVerifiedAt", now] }] };
  await participations.updateOne(filter, [
    {
      $set: {
        verifiedSeconds: {
          $add: [
            "$verifiedSeconds",
            {
              $cond: [
                { $and: [{ $gt: [gapMs, 0] }, { $lt: [gapMs, MAX_PING_GAP_S * 1000] }] },
                { $toInt: { $round: [{ $divide: [gapMs, 1000] }, 0] } },
                0,
              ],
            },
          ],
        },
        // $max: a late, out-of-order event never moves the clock backwards.
        lastVerifiedAt: { $max: ["$lastVerifiedAt", now] },
        lastInRangeAt: { $max: ["$lastInRangeAt", now] },
      },
    },
  ]);
}
