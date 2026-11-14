import type { Db } from "mongodb";
import { collectionsOf } from "@/shared/db";
import { CATALOG } from "./catalog";

/**
 * Called by `npm run db:setup` after the indexes exist. Safe to repeat: each item is
 * inserted only if its id is missing, so stock that redemptions used up is never reset.
 */
export async function seed(db: Db): Promise<void> {
  const { store_items } = collectionsOf(db);
  for (const { _id, ...item } of CATALOG) {
    await store_items.updateOne({ _id }, { $setOnInsert: item }, { upsert: true });
  }
}
