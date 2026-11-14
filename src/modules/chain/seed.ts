import type { Db } from "mongodb";

/** Called by `npm run db:setup` after the indexes exist. Must be safe to run repeatedly. Chain has nothing to seed. */
export async function seed(db: Db): Promise<void> {
  void db;
}
