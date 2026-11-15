import type { Db } from "mongodb";

/** Notifications has nothing to seed: alerts are made as they come due, settings on first change. */
export async function seed(db: Db): Promise<void> {
  void db;
}
