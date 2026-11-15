import type { ChainOutboxDoc } from "@/shared/contracts";
import { getCollections, isDuplicateKeyError, newId } from "@/shared/db";
import type { ChainClient } from "./client";
import { OUTBOX } from "./config";

/**
 * The chain outbox. MongoDB stays the source of truth: a ledger entry becomes one row here,
 * and a drain mirrors pending rows to the chain. Nothing in this file can fail, slow or
 * reverse a points operation; the subscriber only inserts a row.
 */

/** One row per ledger entry; a replayed event hits the unique index and adds nothing. */
export async function enqueue(entry: { entryId: string; userId: string; delta: number }, now = new Date()): Promise<boolean> {
  const { chain_outbox } = await getCollections();
  try {
    await chain_outbox.insertOne({
      _id: newId(),
      ledgerEntryId: entry.entryId,
      userId: entry.userId,
      delta: entry.delta,
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  } catch (error) {
    if (isDuplicateKeyError(error)) return false;
    throw error;
  }
}

export interface DrainResult {
  done: number;
  failed: number;
  /** Rows tried this round that are still pending (error, unconfirmed, or waiting on an earlier row). */
  deferred: number;
}

/** A fresh row, or one whose last claim's lease has run out. */
function claimable(row: ChainOutboxDoc, now: Date): boolean {
  return row.attempts === 0 || now.getTime() - row.updatedAt.getTime() >= OUTBOX.leaseMs;
}

/**
 * Mirrors pending rows to the chain, oldest first. Per user, rows go strictly in order: when
 * one is not finished, that user's later rows wait (a burn must never overtake its mint).
 *
 * Exactly-once: a row is claimed by compare-and-set on `updatedAt` (two drains cannot both
 * win), and its transaction signature is saved BEFORE sending. A later attempt asks the chain
 * about that signature first and only re-sends when it never landed and its blockhash has
 * expired (the lease is longer than a blockhash lives).
 */
export async function drainOutbox(client: ChainClient, opts: { userId?: string; now?: () => Date } = {}): Promise<DrainResult> {
  const clock = opts.now ?? (() => new Date());
  const { chain_outbox } = await getCollections();
  const rows = await chain_outbox
    .find({ status: "pending", ...(opts.userId ? { userId: opts.userId } : {}) })
    .sort({ createdAt: 1, _id: 1 })
    .limit(OUTBOX.batchSize)
    .toArray();

  const blocked = new Set<string>();
  const result: DrainResult = { done: 0, failed: 0, deferred: 0 };

  for (const row of rows) {
    if (blocked.has(row.userId)) {
      result.deferred++;
      continue;
    }
    const now = clock();
    if (!claimable(row, now)) {
      blocked.add(row.userId);
      result.deferred++;
      continue;
    }
    const claimed = await chain_outbox.findOneAndUpdate(
      { _id: row._id, status: "pending", updatedAt: row.updatedAt },
      { $set: { updatedAt: now }, $inc: { attempts: 1 } },
      { returnDocument: "after" },
    );
    if (!claimed) {
      blocked.add(row.userId); // another drain has it
      result.deferred++;
      continue;
    }

    const outcome = await processRow(client, claimed);
    if (outcome === "done") {
      result.done++;
      continue;
    }
    blocked.add(row.userId);
    if (outcome === "failed") result.failed++;
    else result.deferred++;
  }
  return result;
}

async function processRow(client: ChainClient, row: ChainOutboxDoc): Promise<"done" | "failed" | "pending"> {
  const { chain_outbox } = await getCollections();
  const set = (fields: Partial<ChainOutboxDoc>) => chain_outbox.updateOne({ _id: row._id }, { $set: fields });

  try {
    // A previous attempt saved a signature: find out whether it landed before sending anything.
    if (row.signature) {
      const previous = await client.status(row.signature);
      if (previous === "confirmed") {
        await set({ status: "done" });
        return "done";
      }
      // "failed" or "not_found" after the lease: it will never land, so build a new one.
    }

    const prepared = await client.prepare({ userId: row.userId, delta: row.delta });
    await set({ signature: prepared.signature });
    await prepared.send();

    const status = await client.confirm(prepared.signature, OUTBOX.confirmTimeoutMs);
    if (status === "confirmed") {
      await set({ status: "done" });
      return "done";
    }
    return giveUpOrWait(row, status === "failed" ? "Transaction failed on chain" : "Not confirmed yet");
  } catch (error) {
    return giveUpOrWait(row, error instanceof Error ? error.message.slice(0, 300) : "Unknown chain error");
  }
}

async function giveUpOrWait(row: ChainOutboxDoc, lastError: string): Promise<"failed" | "pending"> {
  const { chain_outbox } = await getCollections();
  const failed = row.attempts >= OUTBOX.maxAttempts;
  await chain_outbox.updateOne({ _id: row._id }, { $set: { lastError, ...(failed ? { status: "failed" as const } : {}) } });
  return failed ? "failed" : "pending";
}

export async function pendingCount(userId: string): Promise<number> {
  const { chain_outbox } = await getCollections();
  return chain_outbox.countDocuments({ userId, status: "pending" });
}
