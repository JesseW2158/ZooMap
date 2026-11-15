import type { Activity, ActivityMe, CreateActivityBody, Participation, ParticipationResult } from "@/shared/contracts";

export function activitiesFixture(now: Date): Activity[] {
  const iso = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  return [
    {
      id: "fixture-activity-1",
      hostId: "seed-alex",
      hostName: "Alex Dev",
      title: "Calc II study group",
      description: "Working through problem set 6.",
      placeId: "fx-dubois",
      category: "study",
      status: "active",
      startedAt: iso(25),
      capacity: 8,
      participantCount: 3,
    },
    {
      id: "fixture-activity-2",
      hostId: "seed-blair",
      hostName: "Blair Dev",
      title: "Pickup frisbee",
      placeId: "fx-campus-center",
      category: "sports",
      status: "active",
      startedAt: iso(5),
      participantCount: 5,
    },
  ];
}

/** A user who is in nothing: the empty state of GET /api/activities/me. */
export const noParticipationFixture: ActivityMe = { participation: null, activity: null };

export function createdActivityFixture(body: CreateActivityBody, host: { id: string; name: string }, now: Date): Activity {
  return {
    id: "fixture-activity-new",
    hostId: host.id,
    hostName: host.name,
    title: body.title,
    description: body.description,
    placeId: body.placeId,
    category: body.category,
    status: "active",
    startedAt: now.toISOString(),
    endsAt: body.endsAt,
    capacity: body.capacity,
    participantCount: 1,
  };
}

export function participationResultFixture(activityId: string, userId: string, now: Date): ParticipationResult {
  const activity = { ...activitiesFixture(now)[0], id: activityId };
  const participation: Participation = {
    id: "fixture-participation-1",
    activityId,
    userId,
    role: "guest",
    status: "active",
    joinedAt: new Date(now.getTime() - 12 * 60_000).toISOString(),
    verifiedSeconds: 600,
    verifying: true,
    pendingPoints: 10,
  };
  return { participation, activity };
}

/** What POST /api/activities/:id/leave returns: the participation ended with its final time. */
export function leftResultFixture(activityId: string, userId: string, now: Date): ParticipationResult {
  const result = participationResultFixture(activityId, userId, now);
  return {
    ...result,
    participation: { ...result.participation, status: "ended", leftAt: now.toISOString(), verifying: false },
  };
}

/** What POST /api/activities/:id/end returns. */
export function endedActivityFixture(activityId: string, userId: string, now: Date): Activity {
  const { activity } = participationResultFixture(activityId, userId, now);
  return { ...activity, hostId: userId, status: "ended", endedAt: now.toISOString() };
}
