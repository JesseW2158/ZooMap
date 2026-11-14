import { z } from "zod";
import { Id, LatLng } from "./common";
import { ParticipationRole } from "./activities";

/**
 * Domain events on the in-process bus (`@/shared/events`). Payload times are `Date`
 * (the bus never leaves the process). Subscribers are idempotent: an event may be
 * delivered more than once and must award or change nothing the second time.
 */
export const EVENT_SCHEMAS = {
  /** density -> everyone. `position` is raw and is never stored. */
  "presence.updated": z.object({
    userId: Id,
    position: LatLng,
    placeId: Id.nullable(),
    at: z.date(),
  }),
  "activity.started": z.object({
    activityId: Id,
    hostId: Id,
    placeId: Id,
    at: z.date(),
  }),
  "activity.ended": z.object({
    activityId: Id,
    hostId: Id,
    at: z.date(),
    participantCount: z.number().int().nonnegative(),
  }),
  "participation.started": z.object({
    participationId: Id,
    activityId: Id,
    userId: Id,
    role: ParticipationRole,
    at: z.date(),
  }),
  /** Emitted exactly once per participation, with the final verified time. */
  "participation.ended": z.object({
    participationId: Id,
    activityId: Id,
    userId: Id,
    role: ParticipationRole,
    joinedAt: z.date(),
    endedAt: z.date(),
    verifiedSeconds: z.number().int().nonnegative(),
  }),
  "ledger.entry.created": z.object({
    entryId: Id,
    userId: Id,
    delta: z.number().int(),
    ruleId: z.string(),
    balanceAfter: z.number().int(),
  }),
  "redemption.created": z.object({
    redemptionId: Id,
    userId: Id,
    itemId: Id,
    cost: z.number().int().positive(),
  }),
} as const;

export type EventType = keyof typeof EVENT_SCHEMAS;
export const EVENT_TYPES = Object.keys(EVENT_SCHEMAS) as EventType[];

export type EventMap = { [K in EventType]: z.infer<(typeof EVENT_SCHEMAS)[K]> };
export type EventPayload<K extends EventType> = EventMap[K];
