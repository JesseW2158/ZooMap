import type { CreateConnectionBody, ScheduleConnection, ScheduleEvent, UpdateConnectionBody } from "@/shared/contracts";
import { clearScheduleCache, mergeEvents } from "./events";
import {
  createConnection as create,
  deleteConnection as remove,
  listConnections as list,
  saveGoogleConnection as saveGoogle,
  updateConnection as update,
} from "./connections";

export * as fixtures from "./fixtures";
export { resolvePlace } from "./resolve-place";
export { authUrl as googleAuthUrl, exchangeCode as googleExchangeCode, signState as signGoogleState, verifyState as verifyGoogleState } from "./google";

/**
 * Schedule module (owner: schedule). The user's classes and deadlines from Canvas and other
 * feed links, Google Calendar, and classes entered by hand, with campus places resolved.
 */
export async function getUpcomingEvents(userId: string, range: { from: Date; to: Date }): Promise<ScheduleEvent[]> {
  return mergeEvents(userId, range);
}

export async function listConnections(userId: string): Promise<ScheduleConnection[]> {
  return list(userId);
}

export async function createConnection(userId: string, body: CreateConnectionBody): Promise<ScheduleConnection> {
  return create(userId, body);
}

/**
 * Skip or un-skip one occurrence, or move a plan. The recommend module can add plans with
 * `createConnection(userId, { provider: "plan", label: "Study at …", placeId, date, start, end })`.
 */
export async function updateConnection(userId: string, body: UpdateConnectionBody): Promise<ScheduleConnection> {
  const out = await update(userId, body);
  clearScheduleCache(body.id);
  return out;
}

export async function deleteConnection(userId: string, id: string): Promise<void> {
  await remove(userId, id);
  clearScheduleCache(id);
}

export async function saveGoogleConnection(userId: string, refreshToken: string): Promise<void> {
  await saveGoogle(userId, refreshToken);
}
