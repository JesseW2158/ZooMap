import { getCollections, isDuplicateKeyError } from "@/shared/db";
import { ApiError } from "@/shared/http";

/**
 * Fixed-window rate limit kept in MongoDB, so it holds across serverless instances. One
 * document per bucket, user and window; a TTL index removes it after the window.
 */
export async function rateLimit(bucket: string, userId: string, limit: number, windowMs: number, now = new Date()): Promise<void> {
  const { rate_limits } = await getCollections();
  const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
  const _id = `${bucket}:${userId}:${windowStart}`;
  const bump = () =>
    rate_limits.findOneAndUpdate(
      { _id },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + 2 * windowMs) } },
      { upsert: true, returnDocument: "after" },
    );
  let doc;
  try {
    doc = await bump();
  } catch (error) {
    // Two first requests in the same window can race on the upsert; the loser retries as an update.
    if (!isDuplicateKeyError(error)) throw error;
    doc = await bump();
  }
  if ((doc?.count ?? 0) > limit) throw new ApiError("RATE_LIMITED", "Too many tries. Wait a minute and try again.");
}
