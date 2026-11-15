import type { Db } from "mongodb";

/** Nothing to seed: events are announced by people. */
export async function seed(db: Db): Promise<void> {
  void db;
}
