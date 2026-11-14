import type { Activity, ActivityDoc, Participation, ParticipationDoc, Place } from "@/shared/contracts";
import { env } from "@/shared/config/env";
import { isVerifying, pendingPoints } from "./rules";

/** Stored activity to API shape. `participantCount` and the place come from the caller. */
export function toActivity(doc: ActivityDoc, participantCount: number, place: Place | null | undefined): Activity {
  return {
    id: doc._id,
    hostId: doc.hostId,
    hostName: doc.hostName,
    title: doc.title,
    description: doc.description,
    placeId: doc.placeId,
    placeName: place?.name,
    placeCenter: place?.center,
    category: doc.category,
    status: doc.status,
    startedAt: doc.startedAt.toISOString(),
    endsAt: doc.endsAt?.toISOString(),
    endedAt: doc.endedAt?.toISOString(),
    capacity: doc.capacity,
    participantCount,
  };
}

/** Stored participation to API shape, with `verifying` and `pendingPoints` worked out at `now`. */
export function toParticipation(doc: ParticipationDoc, now: Date): Participation {
  return {
    id: doc._id,
    activityId: doc.activityId,
    userId: doc.userId,
    role: doc.role,
    status: doc.status,
    joinedAt: doc.joinedAt.toISOString(),
    leftAt: doc.leftAt?.toISOString(),
    verifiedSeconds: doc.verifiedSeconds,
    verifying: doc.status === "active" && isVerifying(doc.lastVerifiedAt, now),
    pendingPoints: pendingPoints(doc.verifiedSeconds, env().pointsPerMinute),
  };
}
