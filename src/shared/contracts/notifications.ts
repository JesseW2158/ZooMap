import { z } from "zod";
import { ActivityCategory } from "./activities";
import { Id, IsoTime } from "./common";

/**
 * Notifications and alerts (owner: ws-notifications). Alerts are either worked out from time
 * (exam countdowns, leave-by, quiet rooms in a free gap) or saved when something happens
 * (an activity nearby, points earned). Every kind can be turned off in `AlertSettings`.
 */

export const AlertKind = z.enum([
  "nearby", // an activity close to where you are
  "big-event", // a large activity is on
  "exam", // midterm, final, quiz from the calendar
  "project", // project, paper, presentation
  "assignment", // any other deadline
  "quiet-room", // a quiet study place for a free gap
  "leave-by", // time to walk to the next class
  "points", // points landed
  "activity", // someone joined your activity
]);
export type AlertKind = z.infer<typeof AlertKind>;

/** An alert in the inbox. `id` is stable for its cause, so the same alert is never shown twice. */
export const Alert = z.object({
  id: Id,
  kind: AlertKind,
  title: z.string(),
  body: z.string(),
  /** When it became due. */
  at: IsoTime,
  read: z.boolean(),
  /** Where it is, for a route button. */
  placeId: Id.optional(),
});
export type Alert = z.infer<typeof Alert>;

/** An alert known in advance, for the device to fire at `fireAt` (browser timers, Android local notifications). */
export const UpcomingAlert = z.object({
  id: Id,
  kind: AlertKind,
  title: z.string(),
  body: z.string(),
  fireAt: IsoTime,
  placeId: Id.optional(),
});
export type UpcomingAlert = z.infer<typeof UpcomingAlert>;

const ClockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const AlertSettings = z.object({
  nearby: z.boolean(),
  nearbyRadiusM: z.number().int().min(50).max(1000),
  /** Empty means every category. */
  nearbyCategories: z.array(ActivityCategory),
  bigEvents: z.boolean(),
  exams: z.boolean(),
  projects: z.boolean(),
  assignments: z.boolean(),
  quietRooms: z.boolean(),
  leaveBy: z.boolean(),
  /** Minutes of warning before you need to leave. */
  leaveByLeadMin: z.number().int().min(0).max(30),
  /** Points earned and people joining your activity. */
  updates: z.boolean(),
  /** Local campus time; no time-based alert fires inside it. null = no quiet hours. */
  quietHours: z.object({ start: ClockTime, end: ClockTime }).nullable(),
  /** System notifications say only "ZooMap: <kind>" on the lock screen. */
  hideDetails: z.boolean(),
  /** Every alert is paused until then. */
  pausedUntil: IsoTime.nullable(),
});
export type AlertSettings = z.infer<typeof AlertSettings>;

/** GET /api/notifications */
export const NotificationsResponse = z.object({
  alerts: z.array(Alert),
  unread: z.number().int().nonnegative(),
  /** The next 24 hours, soonest first. */
  upcoming: z.array(UpcomingAlert),
  settings: AlertSettings,
});
export type NotificationsResponse = z.infer<typeof NotificationsResponse>;

/** POST /api/notifications/read: some ids, or everything. */
export const MarkReadBody = z.union([
  z.strictObject({ ids: z.array(Id).min(1).max(200) }),
  z.strictObject({ all: z.literal(true) }),
]);
export type MarkReadBody = z.infer<typeof MarkReadBody>;

/** PUT /api/notifications/settings: only the fields to change. */
export const AlertSettingsBody = AlertSettings.partial().strict();
export type AlertSettingsBody = z.infer<typeof AlertSettingsBody>;
