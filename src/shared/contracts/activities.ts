import { z } from "zod";
import { Id, IsoTime } from "./common";

export const ActivityCategory = z.enum(["study", "social", "sports", "food", "other"]);
export type ActivityCategory = z.infer<typeof ActivityCategory>;

export const ActivityStatus = z.enum(["active", "ended"]);
export type ActivityStatus = z.infer<typeof ActivityStatus>;

export const Activity = z.object({
  id: Id,
  hostId: Id,
  hostName: z.string(),
  title: z.string(),
  description: z.string().optional(),
  placeId: Id,
  category: ActivityCategory,
  status: ActivityStatus,
  startedAt: IsoTime,
  endsAt: IsoTime.optional(),
  endedAt: IsoTime.optional(),
  capacity: z.number().int().positive().optional(),
  participantCount: z.number().int().nonnegative(),
});
export type Activity = z.infer<typeof Activity>;

export const ParticipationRole = z.enum(["host", "guest"]);
export type ParticipationRole = z.infer<typeof ParticipationRole>;

export const Participation = z.object({
  id: Id,
  activityId: Id,
  userId: Id,
  role: ParticipationRole,
  status: ActivityStatus,
  joinedAt: IsoTime,
  leftAt: IsoTime.optional(),
  /** Computed by the server from pings; client-reported durations are ignored. */
  verifiedSeconds: z.number().int().nonnegative(),
  /** The latest ping was in range and recent. */
  verifying: z.boolean(),
  /** What leaving now would pay, before caps. */
  pendingPoints: z.number().int().nonnegative(),
});
export type Participation = z.infer<typeof Participation>;

/** POST /api/activities */
export const CreateActivityBody = z.strictObject({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  placeId: Id,
  category: ActivityCategory,
  endsAt: IsoTime.optional(),
  capacity: z.number().int().min(1).max(500).optional(),
});
export type CreateActivityBody = z.infer<typeof CreateActivityBody>;

/** GET /api/activities returns Activity[]. */
export const ActivityList = z.array(Activity);

/** GET /api/activities/me, and what `getActiveParticipation(userId)` returns. */
export const ActivityMe = z.object({
  participation: Participation.nullable(),
  activity: Activity.nullable(),
});
export type ActivityMe = z.infer<typeof ActivityMe>;

/** POST /api/activities/:id/join and /leave. */
export const ParticipationResult = z.object({
  participation: Participation,
  activity: Activity,
});
export type ParticipationResult = z.infer<typeof ParticipationResult>;
