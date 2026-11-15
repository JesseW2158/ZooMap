import type { CreateIndexesOptions, Db, IndexSpecification } from "mongodb";
import type { CollectionName } from "./collections";

/**
 * Every index, in one place. `ensureIndexes` is idempotent (same name and options is a
 * no-op), so `npm run db:setup` and `withTestDb()` can both call it freely. A new index
 * is an additive change in a commit that touches only this file.
 *
 * The two unique PARTIAL indexes are the product rules "one hosted activity" and "one
 * activity at a time". Handlers insert and map the duplicate-key error (code 11000) to
 * 409 ALREADY_HOSTING / ALREADY_IN_ACTIVITY; an application-level check alone loses races.
 */
export interface IndexDefinition {
  collection: CollectionName;
  key: IndexSpecification;
  options: CreateIndexesOptions & { name: string };
}

export const INDEXES: IndexDefinition[] = [
  { collection: "users", key: { email: 1 }, options: { name: "email_unique", unique: true } },

  // One presence document per user; MongoDB deletes it at `expiresAt` (the sweep lags up to a minute).
  { collection: "presence", key: { expiresAt: 1 }, options: { name: "expires_ttl", expireAfterSeconds: 0 } },
  { collection: "presence", key: { placeId: 1 }, options: { name: "placeId" } },

  {
    collection: "activities",
    key: { hostId: 1 },
    options: { name: "one_active_host_unique", unique: true, partialFilterExpression: { status: "active" } },
  },
  { collection: "activities", key: { status: 1, placeId: 1 }, options: { name: "status_placeId" } },

  {
    collection: "participations",
    key: { userId: 1 },
    options: { name: "one_active_participation_unique", unique: true, partialFilterExpression: { status: "active" } },
  },
  { collection: "participations", key: { activityId: 1, status: 1 }, options: { name: "activityId_status" } },

  { collection: "ledger", key: { idempotencyKey: 1 }, options: { name: "idempotencyKey_unique", unique: true } },
  { collection: "ledger", key: { userId: 1, createdAt: 1 }, options: { name: "userId_createdAt" } },

  { collection: "redemptions", key: { idempotencyKey: 1 }, options: { name: "idempotencyKey_unique", unique: true } },
  { collection: "redemptions", key: { userId: 1, createdAt: -1 }, options: { name: "userId_createdAt" } },

  { collection: "schedule_connections", key: { userId: 1 }, options: { name: "userId" } },

  { collection: "device_tokens", key: { tokenHash: 1 }, options: { name: "tokenHash_unique", unique: true } },
  { collection: "device_tokens", key: { userId: 1 }, options: { name: "userId" } },

  { collection: "handoff_codes", key: { expiresAt: 1 }, options: { name: "expires_ttl", expireAfterSeconds: 0 } },

  // Stretch (chain): one outbox row per ledger entry, so replaying an event adds nothing.
  { collection: "chain_outbox", key: { ledgerEntryId: 1 }, options: { name: "ledgerEntryId_unique", unique: true } },

  // Friends. A friend code resolves through its hash; sparse so profiles with no code yet don't collide.
  { collection: "profiles", key: { friendCodeHash: 1 }, options: { name: "friendCodeHash_unique", unique: true, sparse: true } },
  { collection: "friendships", key: { userIds: 1 }, options: { name: "userIds" } },
  // One pending invite per person per activity.
  {
    collection: "activity_invites",
    key: { activityId: 1, toUserId: 1 },
    options: { name: "one_pending_invite_unique", unique: true, partialFilterExpression: { status: "pending" } },
  },
  { collection: "activity_invites", key: { toUserId: 1, status: 1 }, options: { name: "toUserId_status" } },
  { collection: "rate_limits", key: { expiresAt: 1 }, options: { name: "expires_ttl", expireAfterSeconds: 0 } },

  // Notifications: the inbox, newest first; the nearby rate limit counts by kind; old alerts expire.
  { collection: "notifications", key: { userId: 1, at: -1 }, options: { name: "userId_at" } },
  { collection: "notifications", key: { userId: 1, kind: 1, at: -1 }, options: { name: "userId_kind_at" } },
  { collection: "notifications", key: { expiresAt: 1 }, options: { name: "expires_ttl", expireAfterSeconds: 0 } },
];

export async function ensureIndexes(db: Db): Promise<void> {
  for (const { collection, key, options } of INDEXES) {
    await db.collection(collection).createIndex(key, options);
  }
}
