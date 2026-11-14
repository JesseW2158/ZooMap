import type { Db } from "mongodb";

/**
 * Called by `npm run db:setup` after the indexes exist. Must be safe to run repeatedly.
 * The rewards stream seeds the mock store catalog here (about eight items, upserted by a stable id).
 */
export async function seed(db: Db): Promise<void> {
  void db;
}
