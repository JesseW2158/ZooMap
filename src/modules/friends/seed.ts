import type { Db } from "mongodb";

/** Friends has nothing to seed: profiles are created on first edit or first friend code. */
export async function seed(db: Db): Promise<void> {
  void db;
}
