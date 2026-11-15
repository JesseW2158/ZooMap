import { randomInt } from "node:crypto";
import type { Redemption, RedemptionDoc, StoreItem, StoreItemDoc } from "@/shared/contracts";
import { getCollections, isDuplicateKeyError, newId, withTransaction } from "@/shared/db";
import { emit } from "@/shared/events";
import { ApiError } from "@/shared/http";
import { applyEntryInSession, emitEntryCreated, type AppliedEntry } from "./ledger";

export const STORE_RULE_ID = "store-redemption";

export function toStoreItem(doc: StoreItemDoc): StoreItem {
  return {
    id: doc._id,
    name: doc.name,
    description: doc.description,
    ...(doc.imageUrl ? { imageUrl: doc.imageUrl } : {}),
    cost: doc.cost,
    ...(doc.stock !== undefined ? { stock: doc.stock } : {}),
  };
}

export function toRedemption(doc: RedemptionDoc): Redemption {
  return { id: doc._id, itemId: doc.itemId, cost: doc.cost, code: doc.code, status: doc.status, createdAt: doc.createdAt.toISOString() };
}

/** Active items, cheapest first. */
export async function listStoreItems(): Promise<StoreItem[]> {
  const { store_items } = await getCollections();
  const docs = await store_items.find({ active: true }).sort({ cost: 1, _id: 1 }).toArray();
  return docs.map(toStoreItem);
}

/** Newest first. */
export async function recentRedemptions(userId: string, limit: number): Promise<Redemption[]> {
  const { redemptions } = await getCollections();
  const docs = await redemptions.find({ userId }).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray();
  return docs.map(toRedemption);
}

// No 0/O or 1/I/L, so a code read aloud at a counter is unambiguous.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function newClaimCode(): string {
  const pick = (n: number) => Array.from({ length: n }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `ZOO-${pick(4)}-${pick(4)}`;
}

/** The client's key is scoped to the user so two users can never collide on one. */
function scopedKey(userId: string, clientKey: string): string {
  return `${userId}:${clientKey}`;
}

export interface RedeemResult {
  redemption: Redemption;
  created: boolean;
}

/**
 * Spends points on one item, all in one transaction:
 * 1. stock (when the item has one) is decremented with `stock >= 1` in the filter,
 * 2. the balance is decremented with `pointsBalance >= cost` in the filter, via the ledger,
 * 3. the negative ledger entry and the redemption with a random claim code are inserted.
 * A repeated `Idempotency-Key` returns the first redemption and spends nothing.
 */
export async function redeem(userId: string, itemId: string, clientKey: string, now: Date = new Date()): Promise<RedeemResult> {
  const idempotencyKey = scopedKey(userId, clientKey);
  let result: { redemption: Redemption; created: boolean; applied?: AppliedEntry };

  try {
    result = await withTransaction(async (session) => {
      const { redemptions, store_items } = await getCollections();

      const existing = await redemptions.findOne({ idempotencyKey }, { session });
      if (existing) return { redemption: toRedemption(existing), created: false };

      const item = await store_items.findOne({ _id: itemId, active: true }, { session });
      if (!item) throw new ApiError("NOT_FOUND", "No such item in the store");

      if (item.stock !== undefined) {
        const took = await store_items.updateOne({ _id: itemId, stock: { $gte: 1 } }, { $inc: { stock: -1 } }, { session });
        if (took.modifiedCount === 0) throw new ApiError("OUT_OF_STOCK", `${item.name} is out of stock`);
      }

      const redemptionId = newId();
      const applied = await applyEntryInSession(
        session,
        {
          userId,
          delta: -item.cost,
          ruleId: STORE_RULE_ID,
          reason: `Redeemed ${item.name}`,
          source: { type: "redemption", id: redemptionId },
          idempotencyKey: `redemption:${idempotencyKey}`,
        },
        { requireFunds: true, now },
      );

      const doc: RedemptionDoc = {
        _id: redemptionId,
        userId,
        itemId,
        cost: item.cost,
        code: newClaimCode(),
        status: "issued",
        idempotencyKey,
        createdAt: now,
      };
      await redemptions.insertOne(doc, { session });
      return { redemption: toRedemption(doc), created: true, applied };
    });
  } catch (error) {
    // The same key raced us and won: return its redemption.
    if (!isDuplicateKeyError(error)) throw error;
    const { redemptions } = await getCollections();
    const existing = await redemptions.findOne({ idempotencyKey });
    if (!existing) throw new ApiError("CONFLICT", "Redemption conflicted; try again");
    return { redemption: toRedemption(existing), created: false };
  }

  if (result.created && result.applied) {
    await emitEntryCreated(result.applied);
    await emit("redemption.created", {
      redemptionId: result.redemption.id,
      userId,
      itemId: result.redemption.itemId,
      cost: result.redemption.cost,
    });
  }
  return { redemption: result.redemption, created: result.created };
}
