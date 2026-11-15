import { z } from "zod";
import { ActivityCategory, ActivityStatus, ParticipationRole } from "./activities";
import { PresenceSource } from "./density";
import { ScheduleSource } from "./schedule";
import { InviteStatus, SocialKind } from "./friends";
import { AlertKind, AlertSettings } from "./notifications";

/**
 * MongoDB document shapes, one per collection (see `@/shared/db/indexes.ts` for indexes).
 * `_id` is always a string: `newId()` from `@/shared/db`, except where noted. Every
 * reference to another document is that string too. Times are `Date`.
 */

const id = z.string().min(1);

export const UserDoc = z.object({
  _id: id,
  /** Lower-cased. Unique. */
  email: z.string(),
  name: z.string(),
  image: z.string().optional(),
  createdAt: z.date(),
  /** Cache of the ledger sum. Only rewards' `applyEntry` writes it. */
  pointsBalance: z.number().int(),
  settings: z.object({
    /** Opt-in. Off until the user turns it on. */
    shareLocation: z.boolean(),
  }),
});
export type UserDoc = z.infer<typeof UserDoc>;

/** One document per user, expiring ten minutes after the last ping. No coordinates, no history. */
export const PresenceDoc = z.object({
  /** The user's id. */
  _id: id,
  /** H3 cell, resolution 10. */
  h3: z.string(),
  placeId: id.nullable(),
  source: PresenceSource,
  updatedAt: z.date(),
  /** TTL index target. */
  expiresAt: z.date(),
});
export type PresenceDoc = z.infer<typeof PresenceDoc>;

export const ActivityDoc = z.object({
  _id: id,
  hostId: id,
  /** Denormalised so listing activities needs no join. */
  hostName: z.string(),
  title: z.string(),
  description: z.string().optional(),
  placeId: id,
  category: ActivityCategory,
  status: ActivityStatus,
  startedAt: z.date(),
  endsAt: z.date().optional(),
  endedAt: z.date().optional(),
  capacity: z.number().int().positive().optional(),
});
export type ActivityDoc = z.infer<typeof ActivityDoc>;

export const ParticipationDoc = z.object({
  _id: id,
  activityId: id,
  userId: id,
  role: ParticipationRole,
  status: ActivityStatus,
  joinedAt: z.date(),
  leftAt: z.date().optional(),
  lastVerifiedAt: z.date().optional(),
  /**
   * Added by activities (additive): the latest in-range ping. Unlike `lastVerifiedAt` it is not
   * cleared by an out-of-range ping, so settling can tell how long since the user was last there.
   */
  lastInRangeAt: z.date().optional(),
  verifiedSeconds: z.number().int().nonnegative(),
});
export type ParticipationDoc = z.infer<typeof ParticipationDoc>;

/** Append-only. */
export const LedgerDoc = z.object({
  _id: id,
  userId: id,
  delta: z.number().int(),
  ruleId: z.string(),
  reason: z.string(),
  source: z.object({ type: z.string(), id: z.string() }),
  idempotencyKey: z.string(),
  createdAt: z.date(),
});
export type LedgerDoc = z.infer<typeof LedgerDoc>;

export const StoreItemDoc = z.object({
  _id: id,
  name: z.string(),
  description: z.string(),
  imageUrl: z.string().optional(),
  cost: z.number().int().positive(),
  stock: z.number().int().nonnegative().optional(),
  active: z.boolean(),
});
export type StoreItemDoc = z.infer<typeof StoreItemDoc>;

export const RedemptionDoc = z.object({
  _id: id,
  userId: id,
  itemId: id,
  cost: z.number().int().positive(),
  code: z.string(),
  status: z.enum(["issued", "claimed"]),
  idempotencyKey: z.string(),
  createdAt: z.date(),
});
export type RedemptionDoc = z.infer<typeof RedemptionDoc>;

export const ScheduleConnectionDoc = z.object({
  _id: id,
  userId: id,
  provider: ScheduleSource,
  label: z.string(),
  /** AES-256-GCM of the feed URL or refresh token. Never returned by an API, never logged. */
  secretEnc: z.string(),
  createdAt: z.date().optional(),
  lastSyncAt: z.date().optional(),
  lastError: z.string().optional(),
  /** Added after Phase 0: ids of single occurrences the user skipped. */
  skipped: z.array(z.string()).optional(),
});
export type ScheduleConnectionDoc = z.infer<typeof ScheduleConnectionDoc>;

export const DeviceTokenDoc = z.object({
  _id: id,
  userId: id,
  /** SHA-256 hex of the token. The token itself is never stored. */
  tokenHash: z.string(),
  createdAt: z.date(),
  lastUsedAt: z.date().optional(),
});
export type DeviceTokenDoc = z.infer<typeof DeviceTokenDoc>;

/** One-time sign-in code for the Android handoff. 60 seconds, deleted when read. */
export const HandoffCodeDoc = z.object({
  /** Hash of the code. */
  _id: id,
  userId: id,
  /** base64url(SHA-256(verifier)) sent by the app when it opened the sign-in. The `finish` step must present the verifier. */
  challenge: z.string(),
  expiresAt: z.date(),
});
export type HandoffCodeDoc = z.infer<typeof HandoffCodeDoc>;

/** Stretch (chain). One row per ledger entry; MongoDB stays the source of truth. */
export const ChainOutboxDoc = z.object({
  _id: id,
  ledgerEntryId: id,
  userId: id,
  delta: z.number().int(),
  status: z.enum(["pending", "done", "failed"]),
  attempts: z.number().int().nonnegative(),
  signature: z.string().optional(),
  lastError: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ChainOutboxDoc = z.infer<typeof ChainOutboxDoc>;

/** Friends: one per user, `_id` = userId. Name and photo stay on `users`. */
export const ProfileDoc = z.object({
  _id: id,
  pronouns: z.string().optional(),
  /** E.164. */
  phone: z.string().optional(),
  contactEmail: z.string().optional(),
  socials: z.array(z.object({ kind: SocialKind, handle: z.string() })),
  /** SHA-256 hex of the current friend code; the code itself is never stored. */
  friendCodeHash: z.string().optional(),
  friendCodeIssuedAt: z.date().optional(),
  updatedAt: z.date(),
});
export type ProfileDoc = z.infer<typeof ProfileDoc>;

/** Friends: `_id` = the two user ids sorted and joined with ":", so a pair is unique and adding is idempotent. */
export const FriendshipDoc = z.object({
  _id: id,
  userIds: z.tuple([id, id]),
  createdAt: z.date(),
  via: z.literal("qr"),
});
export type FriendshipDoc = z.infer<typeof FriendshipDoc>;

export const ActivityInviteDoc = z.object({
  _id: id,
  activityId: id,
  fromUserId: id,
  toUserId: id,
  status: InviteStatus,
  createdAt: z.date(),
  respondedAt: z.date().optional(),
});
export type ActivityInviteDoc = z.infer<typeof ActivityInviteDoc>;

/** Fixed-window request counter, `_id` = "<bucket>:<userId>:<window start ms>". Removed by a TTL index. */
export const RateLimitDoc = z.object({
  _id: id,
  count: z.number().int().nonnegative(),
  expiresAt: z.date(),
});
export type RateLimitDoc = z.infer<typeof RateLimitDoc>;

/**
 * Notifications: one per alert shown. `_id` is derived from the cause
 * ("<userId>:exam:<eventId>:3d"), so writing the same alert twice is a no-op. Removed by a TTL index.
 */
export const NotificationDoc = z.object({
  _id: id,
  userId: id,
  kind: AlertKind,
  title: z.string(),
  body: z.string(),
  placeId: id.optional(),
  /** When it became due. */
  at: z.date(),
  readAt: z.date().optional(),
  expiresAt: z.date(),
});
export type NotificationDoc = z.infer<typeof NotificationDoc>;

/** Notifications: a user's alert settings, `_id` = userId. Missing means the defaults. */
export const NotificationSettingsDoc = AlertSettings.omit({ pausedUntil: true }).extend({
  _id: id,
  pausedUntil: z.date().nullable(),
  updatedAt: z.date(),
});
export type NotificationSettingsDoc = z.infer<typeof NotificationSettingsDoc>;
