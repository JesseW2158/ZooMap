import type { DensitySource } from "@/shared/contracts";
import { env } from "@/shared/config/env";
import { getCollections } from "@/shared/db";

/** Presence documents older than this no longer count (the TTL sweep lags by up to a minute). */
export const LIVE_WINDOW_MS = 10 * 60_000;

/**
 * Live people per place, from opted-in pings. Counts below DENSITY_MIN_LIVE_COUNT are
 * dropped, because a count of 1 reveals a person.
 */
export const liveSource: DensitySource = {
  id: "live",
  async getCounts(now) {
    const { presence } = await getCollections();
    const rows = await presence
      .aggregate<{ _id: string; count: number }>([
        { $match: { placeId: { $ne: null }, updatedAt: { $gte: new Date(now.getTime() - LIVE_WINDOW_MS) } } },
        { $group: { _id: "$placeId", count: { $sum: 1 } } },
      ])
      .toArray();
    const min = env().densityMinLiveCount;
    return rows.filter((r) => r.count >= min).map((r) => ({ placeId: r._id, count: r.count }));
  },
};
