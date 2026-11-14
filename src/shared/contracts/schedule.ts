import { z } from "zod";
import { Id, IsoTime } from "./common";

/** What a schedule provider returns. */
export const RawEvent = z.object({
  title: z.string(),
  start: IsoTime,
  end: IsoTime,
  locationText: z.string().optional(),
});
export type RawEvent = z.infer<typeof RawEvent>;

export const ScheduleSource = z.enum(["google", "ics"]);
export type ScheduleSource = z.infer<typeof ScheduleSource>;

export const ScheduleEvent = RawEvent.extend({
  id: Id,
  source: ScheduleSource,
  /** Set when the location text resolved to a campus place. */
  placeId: Id.optional(),
});
export type ScheduleEvent = z.infer<typeof ScheduleEvent>;

/** GET /api/schedule/events?from=&to= (both optional; the module picks defaults). */
export const ScheduleEventsQuery = z.object({
  from: IsoTime.optional(),
  to: IsoTime.optional(),
});
export type ScheduleEventsQuery = z.infer<typeof ScheduleEventsQuery>;
export const ScheduleEventList = z.array(ScheduleEvent);

/** A connection as the API shows it. Secrets are never returned. */
export const ScheduleConnection = z.object({
  id: Id,
  provider: ScheduleSource,
  label: z.string(),
  lastSyncAt: IsoTime.optional(),
  lastError: z.string().optional(),
});
export type ScheduleConnection = z.infer<typeof ScheduleConnection>;
export const ScheduleConnectionList = z.array(ScheduleConnection);

/** POST /api/schedule/connections: a calendar feed link. Google connects through OAuth instead. */
export const CreateConnectionBody = z.strictObject({
  provider: z.literal("ics"),
  label: z.string().trim().min(1).max(60),
  url: z.url(),
});
export type CreateConnectionBody = z.infer<typeof CreateConnectionBody>;

/** DELETE /api/schedule/connections?id= */
export const DeleteConnectionQuery = z.object({ id: Id });

export const ScheduleRange = z.object({ from: z.date(), to: z.date() });
export type ScheduleRange = z.infer<typeof ScheduleRange>;
