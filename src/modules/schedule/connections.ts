import type { CreateConnectionBody, ScheduleConnection, ScheduleConnectionDoc } from "@/shared/contracts";
import { env } from "@/shared/config/env";
import { getCollections, newId } from "@/shared/db";
import { ApiError } from "@/shared/http";
import { getPlace } from "@/modules/campus";
import { decryptSecret, encryptSecret } from "./crypto";
import { describeClass, parseStoredClass } from "./providers/manual";
import { normalizeFeedUrl, urlProblem } from "./safe-fetch";

/**
 * A user's calendar connections. The secret (feed URL, refresh token, or a hand-entered
 * class) is encrypted into `secretEnc` and never leaves this file except to a provider.
 */

export const MAX_CONNECTIONS = 30;

async function summaryOf(doc: ScheduleConnectionDoc): Promise<string | undefined> {
  if (doc.provider === "google") return "Your Google Calendar";
  if (doc.provider === "ics") return /instructure\.com/.test(safeDecrypt(doc) ?? "") ? "Canvas deadlines" : "Calendar feed";
  const secret = safeDecrypt(doc);
  if (!secret) return undefined;
  const c = parseStoredClass(secret);
  const place = c.placeId ? await getPlace(c.placeId) : null;
  return describeClass(c, place?.aliases[0] ?? place?.name);
}

function safeDecrypt(doc: ScheduleConnectionDoc): string | null {
  try {
    return decryptSecret(doc.secretEnc);
  } catch {
    return null;
  }
}

/** The API view of a connection: no secret, ever. */
export async function toApi(doc: ScheduleConnectionDoc): Promise<ScheduleConnection> {
  const out: ScheduleConnection = { id: doc._id, provider: doc.provider, label: doc.label };
  if (doc.lastSyncAt) out.lastSyncAt = doc.lastSyncAt.toISOString();
  if (doc.lastError) out.lastError = doc.lastError;
  const summary = await summaryOf(doc);
  if (summary) out.summary = summary;
  return out;
}

export async function listConnectionDocs(userId: string): Promise<ScheduleConnectionDoc[]> {
  const { schedule_connections } = await getCollections();
  return schedule_connections.find({ userId }).sort({ createdAt: 1, _id: 1 }).toArray();
}

export async function listConnections(userId: string): Promise<ScheduleConnection[]> {
  return Promise.all((await listConnectionDocs(userId)).map(toApi));
}

export async function createConnection(userId: string, body: CreateConnectionBody): Promise<ScheduleConnection> {
  const { schedule_connections } = await getCollections();
  if ((await schedule_connections.countDocuments({ userId })) >= MAX_CONNECTIONS) {
    throw new ApiError("UNPROCESSABLE", `You can have at most ${MAX_CONNECTIONS} calendars and classes`);
  }
  let secret: string;
  if (body.provider === "ics") {
    const url = normalizeFeedUrl(body.url);
    const problem = urlProblem(url, env().icsAllowedHosts);
    if (problem) throw new ApiError("BAD_REQUEST", problem);
    secret = url;
  } else {
    if (body.placeId && !(await getPlace(body.placeId))) throw new ApiError("BAD_REQUEST", "Unknown building");
    const { provider, ...stored } = body;
    void provider;
    secret = JSON.stringify(stored);
  }
  const doc: ScheduleConnectionDoc = {
    _id: newId(),
    userId,
    provider: body.provider,
    label: body.label,
    secretEnc: encryptSecret(secret),
    createdAt: new Date(),
  };
  await schedule_connections.insertOne(doc);
  return toApi(doc);
}

/** Store a Google refresh token, replacing an earlier Google connection of this user. */
export async function saveGoogleConnection(userId: string, refreshToken: string): Promise<void> {
  const { schedule_connections } = await getCollections();
  await schedule_connections.deleteMany({ userId, provider: "google" });
  await schedule_connections.insertOne({
    _id: newId(),
    userId,
    provider: "google",
    label: "Google Calendar",
    secretEnc: encryptSecret(refreshToken),
    createdAt: new Date(),
  });
}

/** Deleting someone else's connection looks the same as deleting a missing one. */
export async function deleteConnection(userId: string, id: string): Promise<void> {
  const { schedule_connections } = await getCollections();
  const res = await schedule_connections.deleteOne({ _id: id, userId });
  if (res.deletedCount === 0) throw new ApiError("NOT_FOUND", "No such calendar");
}

export async function markSynced(id: string, error?: string): Promise<void> {
  const { schedule_connections } = await getCollections();
  await schedule_connections.updateOne(
    { _id: id },
    error ? { $set: { lastError: error } } : { $set: { lastSyncAt: new Date() }, $unset: { lastError: "" } },
  );
}
