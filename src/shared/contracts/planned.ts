import { z } from "zod";
import { ActivityCategory } from "./activities";
import { Id, IsoTime, LatLng } from "./common";

/**
 * Planned events (owner: ws-notifications). An event announced ahead of time ("Spring Concert,
 * Friday 7pm at the Mullins Center"), so people hear about it days before. Separate from
 * activities, which start the moment they are hosted and count verified time for points.
 * Who is going is never listed: only how many, and whether you are.
 */

export const PlannedEvent = z.object({
  id: Id,
  hostId: Id,
  hostName: z.string(),
  title: z.string(),
  description: z.string().optional(),
  placeId: Id,
  placeName: z.string().optional(),
  placeCenter: LatLng.optional(),
  category: ActivityCategory,
  startsAt: IsoTime,
  endsAt: IsoTime,
  capacity: z.number().int().positive().optional(),
  goingCount: z.number().int().nonnegative(),
  /** The caller said they are going. */
  going: z.boolean(),
  /** The caller is the host (who is always going and can cancel). */
  hosting: z.boolean(),
  /** Big enough to announce to everyone: 50+ spots or 15+ going. */
  big: z.boolean(),
  /** When it was announced. */
  createdAt: IsoTime,
});
export type PlannedEvent = z.infer<typeof PlannedEvent>;
export const PlannedEventList = z.array(PlannedEvent);

/** POST /api/planned-events */
export const CreatePlannedEventBody = z.strictObject({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  placeId: Id,
  category: ActivityCategory,
  startsAt: IsoTime,
  /** Defaults to two hours after the start. At most 24 hours long. */
  endsAt: IsoTime.optional(),
  capacity: z.number().int().min(1).max(20000).optional(),
});
export type CreatePlannedEventBody = z.infer<typeof CreatePlannedEventBody>;

/** POST /api/planned-events/[id]/going */
export const GoingBody = z.strictObject({ going: z.boolean() });
export type GoingBody = z.infer<typeof GoingBody>;
