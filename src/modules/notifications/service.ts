import type { Activity, AlertSettings, EventPayload, NotificationsResponse, ScheduleEvent, UpcomingAlert } from "@/shared/contracts";
import { haversineM } from "@/shared/geo";
import { getActiveParticipation, listActiveActivities } from "@/modules/activities";
import { getPlaces } from "@/modules/campus";
import { getDensitySnapshot } from "@/modules/density";
import { findRoute } from "@/modules/routing";
import { getUpcomingEvents } from "@/modules/schedule";
import {
  bigEventAlerts,
  leaveByAlerts,
  quietRoomAlerts,
  workAlerts,
  type Candidate,
  type StudySpot,
  type WalkMinutes,
} from "./producers";
import { getSettings, isPaused, kindEnabled, mayAlert } from "./settings";
import { alertId, countSince, listAlerts, saveAlert, wasAlerted } from "./store";
import { DAY, HOUR, inQuietHours } from "./time";

// ---------------------------------------------------------------- walking times, cached

const walkCache = new Map<string, number | null>();

/** Walking minutes between two places, remembered (campus paths do not change while running). */
export const walkMinutes: WalkMinutes = async (from, to) => {
  const key = `${from}>${to}`;
  if (walkCache.has(key)) return walkCache.get(key)!;
  let minutes: number | null = null;
  try {
    const route = await findRoute({ from: { placeId: from }, to: { placeId: to } });
    minutes = route.durationS / 60;
  } catch {
    minutes = null;
  }
  if (walkCache.size > 5000) walkCache.clear();
  walkCache.set(key, minutes);
  return minutes;
};

async function studySpotsAt(at: Date): Promise<StudySpot[]> {
  const [places, snapshot] = await Promise.all([getPlaces(), getDensitySnapshot(Math.abs(at.getTime() - Date.now()) < 60_000 ? undefined : at)]);
  const byPlace = new Map(snapshot.places.map((p) => [p.placeId, p]));
  return places
    .filter((p) => p.studyFriendly)
    .map((p) => {
      const row = byPlace.get(p.id);
      return { placeId: p.id, name: p.name, level: row?.level ?? 0, simulated: Boolean(row && row.simulated > 0) };
    });
}

// ---------------------------------------------------------------- the inbox

async function safely<T>(task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await task();
  } catch (error) {
    console.error("[notifications] source failed", error);
    return fallback;
  }
}

/** Every time-based alert this user could get between yesterday and tomorrow. */
async function candidatesFor(userId: string, settings: AlertSettings, now: Date): Promise<Candidate[]> {
  const needsSchedule = settings.exams || settings.projects || settings.assignments || settings.leaveBy || settings.quietRooms;
  const [events, activities] = await Promise.all([
    needsSchedule
      ? safely<ScheduleEvent[]>(() => getUpcomingEvents(userId, { from: new Date(now.getTime() - DAY), to: new Date(now.getTime() + 8 * DAY) }), [])
      : Promise.resolve([]),
    settings.bigEvents ? safely<Activity[]>(() => listActiveActivities(now), []) : Promise.resolve([]),
  ]);

  const out: Candidate[] = [...workAlerts(events, now), ...bigEventAlerts(activities, userId)];
  if (settings.leaveBy) out.push(...(await safely(() => leaveByAlerts(events, now, settings.leaveByLeadMin, walkMinutes), [])));
  if (settings.quietRooms) out.push(...(await safely(() => quietRoomAlerts(events, now, { spotsAt: studySpotsAt, walk: walkMinutes }), [])));
  return out.filter((c) => kindEnabled(settings, c.kind));
}

/**
 * The inbox. Time-based alerts that are due now are saved first (once each, keyed by cause),
 * so polling is what "sends" them: there are no background jobs on Vercel.
 */
export async function getNotifications(userId: string, now = new Date()): Promise<NotificationsResponse> {
  const settings = await getSettings(userId);
  const candidates = await candidatesFor(userId, settings, now);
  const t = now.getTime();

  if (!isPaused(settings, now) && !inQuietHours(now, settings.quietHours)) {
    for (const c of candidates) {
      if (c.fireAt.getTime() <= t && t < c.staleAt.getTime()) {
        await saveAlert(userId, { key: c.key, kind: c.kind, title: c.title, body: c.body, at: c.fireAt, placeId: c.placeId });
      }
    }
  }

  const upcoming: UpcomingAlert[] = isPaused(settings, new Date(t + DAY))
    ? []
    : candidates
        .filter((c) => c.fireAt.getTime() > t && c.fireAt.getTime() <= t + DAY)
        .filter((c) => !isPaused(settings, c.fireAt) && !inQuietHours(c.fireAt, settings.quietHours))
        .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
        .slice(0, 50)
        .map((c) => ({
          id: alertId(userId, c.key),
          kind: c.kind,
          title: c.title,
          body: c.body,
          fireAt: c.fireAt.toISOString(),
          ...(c.placeId ? { placeId: c.placeId } : {}),
        }));

  const { alerts, unread } = await listAlerts(userId);
  return { alerts, unread, upcoming, settings };
}

// ---------------------------------------------------------------- alerts caused by events

/** At most this many nearby alerts an hour. */
export const NEARBY_PER_HOUR = 3;

/** A location update: tell the user about an activity within their radius, once per activity. */
export async function onPresence(e: EventPayload<"presence.updated">): Promise<void> {
  const settings = await getSettings(e.userId);
  if (!mayAlert(settings, "nearby", e.at)) return;
  if ((await countSince(e.userId, "nearby", new Date(e.at.getTime() - HOUR))) >= NEARBY_PER_HOUR) return;

  const [activities, mine] = await Promise.all([listActiveActivities(e.at), getActiveParticipation(e.userId, e.at)]);
  const nearby = activities
    .filter((a) => a.hostId !== e.userId && a.id !== mine.activity?.id && a.placeCenter)
    .filter((a) => settings.nearbyCategories.length === 0 || settings.nearbyCategories.includes(a.category))
    .filter((a) => a.capacity === undefined || a.participantCount < a.capacity)
    .map((a) => ({ a, meters: haversineM(e.position, a.placeCenter!) }))
    .filter((x) => x.meters <= settings.nearbyRadiusM)
    .sort((x, y) => x.meters - y.meters);

  for (const { a, meters } of nearby) {
    const key = `nearby:${a.id}`;
    if (await wasAlerted(e.userId, key)) continue;
    const going = a.participantCount === 1 ? "1 person" : `${a.participantCount} people`;
    await saveAlert(e.userId, {
      key,
      kind: "nearby",
      title: `Nearby: ${a.title}`,
      body: `${a.placeName ?? "Close by"} · ${Math.max(10, Math.round(meters / 10) * 10)} m away · ${going} in`,
      at: e.at,
      placeId: a.placeId,
    });
    return; // one at a time
  }
}

export async function onLedgerEntry(e: EventPayload<"ledger.entry.created">): Promise<void> {
  if (e.delta <= 0) return;
  const now = new Date();
  if (!mayAlert(await getSettings(e.userId), "points", now)) return;
  await saveAlert(e.userId, {
    key: `points:${e.entryId}`,
    kind: "points",
    title: `+${e.delta} points`,
    body: `Your balance is now ${e.balanceAfter}.`,
    at: now,
  });
}

/** Someone joined your activity. The host is told how many are in, never who. */
export async function onParticipationStarted(e: EventPayload<"participation.started">): Promise<void> {
  if (e.role !== "guest") return;
  const activity = (await listActiveActivities(e.at)).find((a) => a.id === e.activityId);
  if (!activity) return;
  if (!mayAlert(await getSettings(activity.hostId), "activity", e.at)) return;
  const others = Math.max(1, activity.participantCount - 1);
  await saveAlert(activity.hostId, {
    key: `joined:${e.participationId}`,
    kind: "activity",
    title: `Someone joined ${activity.title}`,
    body: `${others === 1 ? "1 person has" : `${others} people have`} joined so far.`,
    at: e.at,
    placeId: activity.placeId,
  });
}
