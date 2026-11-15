import type { Db } from "mongodb";

/** The assistant stores nothing, so there is nothing to seed. Not called by `db:setup`. */
export async function seed(db: Db): Promise<void> {
  void db;
}
