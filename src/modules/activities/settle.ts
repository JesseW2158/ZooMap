import { getCollections } from "@/shared/db";
import { emit } from "@/shared/events";
import { GUEST_IDLE_S, HOST_IDLE_S } from "./rules";

/**
 * Ending things. Every ending flips `status` with a conditional update and emits only when
 * that update matched, so `participation.ended` and `activity.ended` go out exactly once
 * however many requests race to end the same thing.
 */

/** Ends one participation. True if this call ended it (and emitted `participation.ended`). */
export async function endParticipation(participationId: string, now: Date): Promise<boolean> {
  const { participations } = await getCollections();
  const ended = await participations.findOneAndUpdate(
    { _id: participationId, status: "active" },
    { $set: { status: "ended", leftAt: now } },
    { returnDocument: "after" },
  );
  if (!ended) return false;
  await emit("participation.ended", {
    participationId: ended._id,
    activityId: ended.activityId,
    userId: ended.userId,
    role: ended.role,
    joinedAt: ended.joinedAt,
    endedAt: now,
    verifiedSeconds: ended.verifiedSeconds,
  });
  return true;
}

/**
 * Ends an activity and every participation in it. The activity flips first, so nobody can
 * join while the participations are being ended. Its participations are ended even when the
 * activity was already ended, which finishes a run that stopped half way.
 */
export async function endActivity(activityId: string, now: Date): Promise<boolean> {
  const { activities, participations } = await getCollections();
  const ended = await activities.findOneAndUpdate(
    { _id: activityId, status: "active" },
    { $set: { status: "ended", endedAt: now } },
    { returnDocument: "after" },
  );

  const active = await participations.find({ activityId, status: "active" }, { projection: { _id: 1 } }).toArray();
  for (const p of active) await endParticipation(p._id, now);

  if (!ended) return false;
  await emit("activity.ended", {
    activityId: ended._id,
    hostId: ended.hostId,
    at: now,
    participantCount: await participations.countDocuments({ activityId }),
  });
  return true;
}

const idleFilter = (role: "host" | "guest", cutoff: Date) => ({
  status: "active" as const,
  role,
  $or: [{ lastInRangeAt: { $lt: cutoff } }, { lastInRangeAt: { $exists: false }, joinedAt: { $lt: cutoff } }],
});

/**
 * There is no scheduler, so this runs at the start of every activities read and on each
 * presence event. It ends:
 *  - activities past `endsAt`;
 *  - activities whose host has had no verified ping for 30 minutes (counted from joining
 *    when there has been none);
 *  - guest participations with no verified ping for 15 minutes;
 *  - participations left active in an activity that is no longer active.
 */
export async function settleStale(now: Date = new Date()): Promise<void> {
  const { activities, participations } = await getCollections();

  const expired = await activities
    .find({ status: "active", endsAt: { $lte: now } }, { projection: { _id: 1 } })
    .toArray();
  const idleHosts = await participations
    .find(idleFilter("host", new Date(now.getTime() - HOST_IDLE_S * 1000)), { projection: { activityId: 1 } })
    .toArray();
  for (const id of new Set([...expired.map((a) => a._id), ...idleHosts.map((p) => p.activityId)])) {
    await endActivity(id, now);
  }

  const idleGuests = await participations
    .find(idleFilter("guest", new Date(now.getTime() - GUEST_IDLE_S * 1000)), { projection: { _id: 1 } })
    .toArray();
  for (const p of idleGuests) await endParticipation(p._id, now);

  const stillActive = await participations
    .find({ status: "active" }, { projection: { _id: 1, activityId: 1 } })
    .toArray();
  if (stillActive.length === 0) return;
  const activityIds = [...new Set(stillActive.map((p) => p.activityId))];
  const live = new Set(
    (await activities.find({ _id: { $in: activityIds }, status: "active" }, { projection: { _id: 1 } }).toArray()).map(
      (a) => a._id,
    ),
  );
  for (const p of stillActive) if (!live.has(p.activityId)) await endParticipation(p._id, now);
}
