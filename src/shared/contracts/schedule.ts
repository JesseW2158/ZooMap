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

/** `manual` (added after Phase 0): a class the user entered by hand. */
export const ScheduleSource = z.enum(["google", "ics", "manual"]);
export type ScheduleSource = z.infer<typeof ScheduleSource>;

export const ScheduleEvent = RawEvent.extend({
  id: Id,
  source: ScheduleSource,
  /** Set when the location text resolved to a campus place. */
  placeId: Id.optional(),
  /** Added after Phase 0 (optional): a date-only event; `start` is midnight UTC of that date. */
  allDay: z.boolean().optional(),
  /** Added after Phase 0 (optional): something due (a Canvas assignment), not somewhere to be. */
  deadline: z.boolean().optional(),
  /** Added after Phase 0 (optional): course code parsed from the title, e.g. "CICS 210". */
  course: z.string().optional(),
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
  /** Added after Phase 0 (optional): a description safe to show, e.g. "MWF 10:10–11:00 · ILC S131". */
  summary: z.string().optional(),
});
export type ScheduleConnection = z.infer<typeof ScheduleConnection>;
export const ScheduleConnectionList = z.array(ScheduleConnection);

/** POST /api/schedule/connections: a calendar feed link. Google connects through OAuth instead. */
export const CreateIcsConnectionBody = z.strictObject({
  provider: z.literal("ics"),
  label: z.string().trim().min(1).max(60),
  url: z.url(),
});

export const Weekday = z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
export type Weekday = z.infer<typeof Weekday>;
/** "HH:MM", 24-hour, campus local time (America/New_York). */
export const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM, 24-hour");

/** Added after Phase 0: a weekly class entered by hand. `label` is the course, e.g. "CICS 210". */
export const ManualClass = z
  .strictObject({
    provider: z.literal("manual"),
    label: z.string().trim().min(1).max(60),
    placeId: Id.optional(),
    room: z.string().trim().max(30).optional(),
    days: z.array(Weekday).min(1).max(7),
    start: LocalTime,
    end: LocalTime,
  })
  .refine((c) => c.end > c.start, { message: "end must be after start", path: ["end"] });
export type ManualClass = z.infer<typeof ManualClass>;

/** Either a feed link or (added after Phase 0) a class entered by hand. */
export const CreateConnectionBody = z.union([CreateIcsConnectionBody, ManualClass]);
export type CreateConnectionBody = z.infer<typeof CreateConnectionBody>;

/** DELETE /api/schedule/connections?id= */
export const DeleteConnectionQuery = z.object({ id: Id });

export const ScheduleRange = z.object({ from: z.date(), to: z.date() });
export type ScheduleRange = z.infer<typeof ScheduleRange>;
