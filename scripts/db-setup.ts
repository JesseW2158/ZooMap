/**
 * `npm run db:setup`: ensure indexes, then seed. Safe to repeat: indexes are created only
 * when missing and every seed uses insert-if-missing, so a second run changes nothing.
 * A new database has NO indexes until this runs, so the unique-host and one-activity
 * guarantees do not exist before it.
 */
import { loadEnv } from "./load-env";
loadEnv();

import { seed as seedActivities } from "@/modules/activities/seed";
import { seed as seedAuth } from "@/modules/auth/seed";
import { seed as seedCampus } from "@/modules/campus/seed";
import { seed as seedChain } from "@/modules/chain/seed";
import { seed as seedDensity } from "@/modules/density/seed";
import { seed as seedMobile } from "@/modules/mobile/seed";
import { seed as seedRecommend } from "@/modules/recommend/seed";
import { seed as seedRewards } from "@/modules/rewards/seed";
import { seed as seedRouting } from "@/modules/routing/seed";
import { seed as seedSchedule } from "@/modules/schedule/seed";
import { env, requireEnv } from "@/shared/config/env";
import { INDEXES, closeClient, ensureIndexes, getDb } from "@/shared/db";

// Order matters only where one seed needs another's rows: users first.
const SEEDS: [name: string, run: (db: Awaited<ReturnType<typeof getDb>>) => Promise<void>][] = [
  ["auth", seedAuth],
  ["campus", seedCampus],
  ["density", seedDensity],
  ["routing", seedRouting],
  ["schedule", seedSchedule],
  ["activities", seedActivities],
  ["rewards", seedRewards],
  ["recommend", seedRecommend],
  ["mobile", seedMobile],
  ["chain", seedChain],
];

async function main() {
  requireEnv("MONGODB_URI"); // throws a clear message; the value is never printed
  const db = await getDb();
  console.log(`database: ${env().mongodbDb}`);

  await ensureIndexes(db);
  console.log(`indexes: ${INDEXES.length} ensured`);

  for (const [name, run] of SEEDS) {
    await run(db);
    console.log(`seed: ${name}`);
  }
  console.log("done");
}

main()
  .catch((error) => {
    // Print the message only: driver errors can carry the connection string.
    const message = error instanceof Error ? error.message.replace(/mongodb(\+srv)?:\/\/[^\s"']+/g, "mongodb://<hidden>") : "unknown error";
    console.error(`db:setup failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(() => closeClient());
