import type { ClientSession } from "mongodb";
import { LedgerDraft, type LedgerDoc, type LedgerEntry } from "@/shared/contracts";
import { getCollections, isDuplicateKeyError, newId, withTransaction } from "@/shared/db";
import { emit } from "@/shared/events";
import { ApiError } from "@/shared/http";

/**
 * The points ledger. `ledger` is append-only and `users.pointsBalance` is a cache of its sum.
 * The functions in this file are the ONLY code that writes either one.
 */

export interface AppliedEntry {
  entry: LedgerEntry;
  /** False when the idempotency key already existed: nothing was written. */
  created: boolean;
  /** The user's balance right after this entry (current balance for a duplicate). */
  balanceAfter: number;
}

export interface ApplyOptions {
  /** Refuse with 409 INSUFFICIENT_POINTS instead of letting the balance go below zero. */
  requireFunds?: boolean;
  now?: Date;
}

export function toLedgerEntry(doc: LedgerDoc): LedgerEntry {
  return {
    id: doc._id,
    userId: doc.userId,
    delta: doc.delta,
    ruleId: doc.ruleId,
    reason: doc.reason,
    source: doc.source,
    idempotencyKey: doc.idempotencyKey,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Writes one entry and moves the balance, inside the caller's transaction. Emits nothing:
 * the caller emits `ledger.entry.created` after the transaction commits (MongoDB may re-run
 * the transaction body, so side effects belong outside it).
 *
 * With `requireFunds`, the balance update carries `pointsBalance >= cost` in its filter, so
 * two concurrent spends can never both succeed against a balance that affords one.
 */
export async function applyEntryInSession(
  session: ClientSession,
  input: LedgerDraft,
  options: ApplyOptions = {},
): Promise<AppliedEntry> {
  const draft = LedgerDraft.parse(input);
  const { ledger, users } = await getCollections();

  const existing = await ledger.findOne({ idempotencyKey: draft.idempotencyKey }, { session });
  if (existing) {
    const user = await users.findOne({ _id: existing.userId }, { session, projection: { pointsBalance: 1 } });
    return { entry: toLedgerEntry(existing), created: false, balanceAfter: user?.pointsBalance ?? 0 };
  }

  const filter =
    options.requireFunds && draft.delta < 0
      ? { _id: draft.userId, pointsBalance: { $gte: -draft.delta } }
      : { _id: draft.userId };
  const user = await users.findOneAndUpdate(
    filter,
    { $inc: { pointsBalance: draft.delta } },
    { session, returnDocument: "after", projection: { pointsBalance: 1 } },
  );
  if (!user) {
    const exists = await users.countDocuments({ _id: draft.userId }, { session, limit: 1 });
    throw exists ? new ApiError("INSUFFICIENT_POINTS", "Not enough points") : new ApiError("NOT_FOUND", "No such user");
  }

  const doc: LedgerDoc = { _id: newId(), ...draft, createdAt: options.now ?? new Date() };
  await ledger.insertOne(doc, { session });
  return { entry: toLedgerEntry(doc), created: true, balanceAfter: user.pointsBalance };
}

export async function emitEntryCreated(applied: AppliedEntry): Promise<void> {
  if (!applied.created) return;
  const { entry } = applied;
  await emit("ledger.entry.created", {
    entryId: entry.id,
    userId: entry.userId,
    delta: entry.delta,
    ruleId: entry.ruleId,
    balanceAfter: applied.balanceAfter,
  });
}

/**
 * Appends one entry and updates the cached balance in a single transaction, then emits
 * `ledger.entry.created`. A key that already exists is success: it returns the first entry
 * and writes nothing, so replaying an event never pays twice.
 */
export async function applyEntry(draft: LedgerDraft, options: ApplyOptions = {}): Promise<AppliedEntry> {
  let applied: AppliedEntry;
  try {
    applied = await withTransaction((session) => applyEntryInSession(session, draft, options));
  } catch (error) {
    // A concurrent writer inserted the same key between our check and our insert.
    if (!isDuplicateKeyError(error)) throw error;
    applied = await readExisting(draft.idempotencyKey);
  }
  await emitEntryCreated(applied);
  return applied;
}

async function readExisting(idempotencyKey: string): Promise<AppliedEntry> {
  const { ledger, users } = await getCollections();
  const existing = await ledger.findOne({ idempotencyKey });
  if (!existing) throw new ApiError("CONFLICT", "Ledger write conflicted; try again");
  const user = await users.findOne({ _id: existing.userId }, { projection: { pointsBalance: 1 } });
  return { entry: toLedgerEntry(existing), created: false, balanceAfter: user?.pointsBalance ?? 0 };
}

export async function ledgerKeyExists(idempotencyKey: string): Promise<boolean> {
  const { ledger } = await getCollections();
  return (await ledger.countDocuments({ idempotencyKey }, { limit: 1 })) > 0;
}

/** Oldest first. `since` is inclusive. */
export async function ledgerForUser(userId: string, opts: { since?: Date; ruleId?: string } = {}): Promise<LedgerEntry[]> {
  const { ledger } = await getCollections();
  const docs = await ledger
    .find({
      userId,
      ...(opts.since ? { createdAt: { $gte: opts.since } } : {}),
      ...(opts.ruleId ? { ruleId: opts.ruleId } : {}),
    })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  return docs.map(toLedgerEntry);
}

/** Newest first. */
export async function recentEntries(userId: string, limit: number): Promise<LedgerEntry[]> {
  const { ledger } = await getCollections();
  const docs = await ledger.find({ userId }).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray();
  return docs.map(toLedgerEntry);
}

export async function readBalance(userId: string): Promise<number> {
  const { users } = await getCollections();
  const user = await users.findOne({ _id: userId }, { projection: { pointsBalance: 1 } });
  return user?.pointsBalance ?? 0;
}
