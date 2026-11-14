import { createHash } from "node:crypto";
import type { ScheduleConnectionDoc, ScheduleEvent, ScheduleRange } from "@/shared/contracts";
import { decryptSecret } from "./crypto";
import { listConnectionDocs, markSynced } from "./connections";
import { GoogleRevokedError } from "./google";
import type { ProviderEvent } from "./ics";
import { PROVIDERS } from "./providers";
import { resolvePlace } from "./resolve-place";
import { FeedError } from "./safe-fetch";

/**
 * Merge every connection of a user into one sorted list. Each connection's events are cached
 * per server instance for five minutes; a failing connection records `lastError` and the
 * others still show.
 */

const CACHE_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 500;
/** The widest range served; `from`/`to` come from the query string. */
export const MAX_RANGE_MS = 62 * 86_400_000;
const MAX_DISTANCE_MS = 366 * 86_400_000;

/** Keep requests to at most 62 days, within a year of now, so expansion and caching stay bounded. */
export function clampRange(range: ScheduleRange, now = Date.now()): ScheduleRange {
  const lo = now - MAX_DISTANCE_MS, hi = now + MAX_DISTANCE_MS;
  const from = Math.min(Math.max(range.from.getTime(), lo), hi);
  const to = Math.min(Math.max(range.to.getTime(), from), from + MAX_RANGE_MS, hi);
  return { from: new Date(from), to: new Date(to) };
}

function remember(key: string, entry: { at: number; events: ProviderEvent[] }) {
  for (const [k, v] of cache) if (entry.at - v.at >= CACHE_MS) cache.delete(k);
  while (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, entry);
}
const cacheHolder = globalThis as unknown as { __zoomapScheduleCache?: Map<string, { at: number; events: ProviderEvent[] }> };
const cache = (cacheHolder.__zoomapScheduleCache ??= new Map());

/** Fetch a padded window so small changes in `from`/`to` hit the cache. */
function windowFor(range: ScheduleRange): ScheduleRange {
  const day = 86_400_000;
  return { from: new Date(Math.floor(range.from.getTime() / day) * day - day), to: new Date(Math.ceil(range.to.getTime() / day) * day + day) };
}

export function clearScheduleCache(connectionId?: string): void {
  if (!connectionId) return cache.clear();
  for (const key of cache.keys()) if (key.startsWith(`${connectionId}|`)) cache.delete(key);
}

function userMessage(err: unknown): string {
  if (err instanceof FeedError || err instanceof GoogleRevokedError) return err.message;
  return "Could not read this calendar right now";
}

async function eventsOf(doc: ScheduleConnectionDoc, range: ScheduleRange, now: number): Promise<ProviderEvent[]> {
  const win = windowFor(range);
  const key = `${doc._id}|${win.from.getTime()}|${win.to.getTime()}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.events;
  try {
    const events = await PROVIDERS[doc.provider].fetchEvents(
      { id: doc._id, userId: doc.userId, provider: doc.provider, label: doc.label, secret: decryptSecret(doc.secretEnc) },
      win,
    );
    remember(key, { at: now, events });
    // hand-entered classes and plans need no sync bookkeeping
    if (doc.provider !== "manual" && doc.provider !== "plan" && (doc.lastError || !doc.lastSyncAt || now - doc.lastSyncAt.getTime() > CACHE_MS)) await markSynced(doc._id);
    return events;
  } catch (err) {
    // never log the error object: a fetch error can carry the feed URL
    console.warn(`schedule: connection ${doc._id} (${doc.provider}) failed: ${userMessage(err)}`);
    await markSynced(doc._id, userMessage(err));
    return [];
  }
}

const eventId = (connectionId: string, uid: string) => createHash("sha256").update(`${connectionId}|${uid}`).digest("base64url").slice(0, 20);

export async function mergeEvents(userId: string, requested: ScheduleRange, now = Date.now()): Promise<ScheduleEvent[]> {
  const range = clampRange(requested, now);
  const docs = await listConnectionDocs(userId);
  const perConnection = await Promise.all(docs.map(async (doc) => ({ doc, events: await eventsOf(doc, range, now) })));
  const out: ScheduleEvent[] = [];
  for (const { doc, events } of perConnection) {
    for (const e of events) {
      const endForOverlap = e.end > e.start ? e.end : e.start;
      if (endForOverlap < range.from || e.start > range.to) continue;
      const placeId = e.placeId ?? (e.deadline ? undefined : await resolvePlace(e.locationText));
      const id = eventId(doc._id, e.uid);
      const ev: ScheduleEvent = {
        id,
        connectionId: doc._id,
        source: doc.provider,
        title: e.title,
        start: e.start.toISOString(),
        end: e.end.toISOString(),
      };
      if (e.locationText) ev.locationText = e.locationText;
      if (placeId) ev.placeId = placeId;
      if (e.allDay) ev.allDay = true;
      if (e.deadline) ev.deadline = true;
      if (e.course) ev.course = e.course;
      if (doc.skipped?.includes(id)) ev.skipped = true;
      out.push(ev);
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}
