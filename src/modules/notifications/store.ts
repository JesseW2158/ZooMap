import type { Alert, AlertKind, MarkReadBody } from "@/shared/contracts";
import { getCollections } from "@/shared/db";
import { DAY } from "./time";

/** Saved alerts disappear after this (TTL index). */
export const KEEP_MS = 14 * DAY;
const INBOX_SIZE = 30;

export interface NewAlert {
  key: string;
  kind: AlertKind;
  title: string;
  body: string;
  at: Date;
  placeId?: string;
}

export const alertId = (userId: string, key: string) => `${userId}:${key}`;

/** Save an alert once. Returns true when it is new. */
export async function saveAlert(userId: string, alert: NewAlert): Promise<boolean> {
  const { notifications } = await getCollections();
  const doc = {
    userId,
    kind: alert.kind,
    title: alert.title,
    body: alert.body,
    at: alert.at,
    expiresAt: new Date(alert.at.getTime() + KEEP_MS),
    ...(alert.placeId ? { placeId: alert.placeId } : {}),
  };
  try {
    const res = await notifications.updateOne({ _id: alertId(userId, alert.key) }, { $setOnInsert: doc }, { upsert: true });
    return res.upsertedCount === 1;
  } catch (error) {
    // two requests saving the same alert at once: the other one won
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

export async function wasAlerted(userId: string, key: string): Promise<boolean> {
  const { notifications } = await getCollections();
  return (await notifications.countDocuments({ _id: alertId(userId, key) }, { limit: 1 })) > 0;
}

export async function countSince(userId: string, kind: AlertKind, since: Date): Promise<number> {
  const { notifications } = await getCollections();
  return notifications.countDocuments({ userId, kind, at: { $gte: since } });
}

export async function listAlerts(userId: string): Promise<{ alerts: Alert[]; unread: number }> {
  const { notifications } = await getCollections();
  const [docs, unread] = await Promise.all([
    notifications.find({ userId }).sort({ at: -1 }).limit(INBOX_SIZE).toArray(),
    notifications.countDocuments({ userId, readAt: { $exists: false } }),
  ]);
  return {
    alerts: docs.map((d) => ({
      id: d._id,
      kind: d.kind,
      title: d.title,
      body: d.body,
      at: d.at.toISOString(),
      read: Boolean(d.readAt),
      ...(d.placeId ? { placeId: d.placeId } : {}),
    })),
    unread,
  };
}

/** Marks only the caller's own alerts. */
export async function markRead(userId: string, body: MarkReadBody, now = new Date()): Promise<void> {
  const { notifications } = await getCollections();
  const filter = "all" in body ? { userId } : { userId, _id: { $in: body.ids } };
  await notifications.updateMany({ ...filter, readAt: { $exists: false } }, { $set: { readAt: now } });
}
