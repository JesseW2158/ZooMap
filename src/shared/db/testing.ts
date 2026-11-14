import { afterAll, beforeAll } from "vitest";
import type { Db } from "mongodb";
import { env } from "@/shared/config/env";
import { closeClient, getClient } from "./client";
import { COLLECTION_NAMES, collectionsOf, type Collections } from "./collections";
import { ensureIndexes } from "./indexes";

export interface TestDb {
  /** Valid inside tests and `beforeEach`, after the file's `beforeAll` has run. */
  readonly db: Db;
  readonly cols: Collections;
}

/**
 * Test database for real unique indexes and transactions.
 *
 * Call once at the top level of a `*.db.test.ts` file:
 *
 *   const t = withTestDb();
 *   it("rejects a second active host", async () => { await t.cols.activities.insertOne(...) });
 *
 * - Works in the Atlas database `${MONGODB_DB}_test`. It points `MONGODB_DB` there for the
 *   whole test process, so module code that calls `getDb()` / `getCollections()` lands in it too.
 * - Ensures indexes, then empties every collection, before the file's tests run.
 * - Refuses to touch any database whose name does not end in `_test`.
 * - `*.db.test.ts` files run serially in their own vitest project (see vitest.config.ts).
 * - Set SKIP_DB_TESTS=1 to leave these files out when there is no database to hand.
 */
export function withTestDb(): TestDb {
  const state: { db?: Db } = {};

  beforeAll(async () => {
    if (!process.env.MONGODB_URI) {
      throw new Error(
        "MONGODB_URI is not set, so database tests cannot run. Put it in .env.local, or run with SKIP_DB_TESTS=1.",
      );
    }
    const base = env().mongodbDb;
    if (!base.endsWith("_test")) process.env.MONGODB_DB = `${base}_test`;

    const db = (await getClient()).db(env().mongodbDb);
    if (!db.databaseName.endsWith("_test")) {
      throw new Error(`Refusing to empty database "${db.databaseName}": test databases must end in "_test".`);
    }
    await ensureIndexes(db);
    await Promise.all(COLLECTION_NAMES.map((name) => db.collection(name).deleteMany({})));
    state.db = db;
  }, 60_000);

  afterAll(async () => {
    await closeClient();
  });

  return {
    get db() {
      if (!state.db) throw new Error("withTestDb(): the database is not ready yet; use it inside a test or hook.");
      return state.db;
    },
    get cols() {
      return collectionsOf(this.db);
    },
  };
}
