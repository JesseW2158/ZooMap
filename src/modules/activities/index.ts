import type { Activity, ActivityMe } from "@/shared/contracts";
import { activitiesFixture, noParticipationFixture } from "./fixtures";

export * as fixtures from "./fixtures";

/**
 * Activities module (owner: activities). FOUNDATION STUBS: made-up activities and no
 * participation. The owning stream replaces the bodies (and calls `settleStale`); the
 * signatures stay.
 */

/** Active activities with participant counts. */
export async function listActiveActivities(): Promise<Activity[]> {
  // FOUNDATION STUB
  return activitiesFixture(new Date());
}

/** The user's current participation and its activity, or `{ participation: null, activity: null }`. */
export async function getActiveParticipation(userId: string): Promise<ActivityMe> {
  // FOUNDATION STUB
  void userId;
  return noParticipationFixture;
}
