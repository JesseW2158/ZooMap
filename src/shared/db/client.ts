import { MongoClient, type ClientSession, type Db } from "mongodb";
import { env, requireEnv } from "@/shared/config/env";

/**
 * One MongoClient per server instance, cached on `globalThis` so it survives hot reloads in
 * dev and is reused across warm invocations on Vercel. The connection promise is cached, not
 * the client, so concurrent first requests share one connect; a failed connect is not cached.
 */
const globalForMongo = globalThis as unknown as { __zoomapMongo?: Promise<MongoClient> };

export function getClient(): Promise<MongoClient> {
  if (!globalForMongo.__zoomapMongo) {
    const client = new MongoClient(requireEnv("MONGODB_URI"), {
      appName: "zoomap",
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8_000,
      retryWrites: true,
    });
    globalForMongo.__zoomapMongo = client.connect().catch((error) => {
      globalForMongo.__zoomapMongo = undefined;
      throw error;
    });
  }
  return globalForMongo.__zoomapMongo;
}

/** The app database (`MONGODB_DB`). Tests get `${MONGODB_DB}_test` through `withTestDb()`. */
export async function getDb(name: string = env().mongodbDb): Promise<Db> {
  return (await getClient()).db(name);
}

export async function closeClient(): Promise<void> {
  const pending = globalForMongo.__zoomapMongo;
  globalForMongo.__zoomapMongo = undefined;
  if (pending) await (await pending).close();
}

/**
 * Runs `fn` in a transaction (needs a replica set, which Atlas always is). MongoDB may
 * re-run `fn` after a transient error, so keep side effects other than database writes
 * (events, HTTP calls) outside it. Pass the session to every operation inside.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const client = await getClient();
  const session = client.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
    return result as T;
  } finally {
    await session.endSession();
  }
}
