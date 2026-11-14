import type {
  Activity,
  ActivityDoc,
  ActivityMe,
  ActivityPlacesQuery,
  AuthUser,
  CreateActivityBody,
  ParticipationDoc,
  ParticipationResult,
  Place,
} from "@/shared/contracts";
import { duplicateKeyIndexName, getCollections, isDuplicateKeyError, newId, withTransaction } from "@/shared/db";
import { emit } from "@/shared/events";
import { ApiError } from "@/shared/http";
import { haversineM } from "@/shared/geo";
import { getPlace, getPlaces } from "@/modules/campus";
import { toActivity, toParticipation } from "./mappers";
import { endActivity, endParticipation, settleStale } from "./settle";

type User = Pick<AuthUser, "id" | "email" | "name">;

const HOST_INDEX = "one_active_host_unique";
const PARTICIPATION_INDEX = "one_active_participation_unique";

/** A duplicate-key error from one of the two unique partial indexes, as the matching 409. */
function conflictFrom(error: unknown): ApiError | null {
  if (!isDuplicateKeyError(error)) return null;
  const index = duplicateKeyIndexName(error);
  const keys = (error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
  if (index === HOST_INDEX || "hostId" in keys) {
    return new ApiError("ALREADY_HOSTING", "You are already hosting an activity. End it before hosting another.");
  }
  if (index === PARTICIPATION_INDEX || "userId" in keys) {
    return new ApiError("ALREADY_IN_ACTIVITY", "You are already in an activity. Leave it first.");
  }
  return null;
}

/** Active participations per activity for active ones; everyone who took part for ended ones. */
async function participantCounts(docs: ActivityDoc[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (docs.length === 0) return counts;
  const { participations } = await getCollections();
  const activeIds = docs.filter((d) => d.status === "active").map((d) => d._id);
  const endedIds = docs.filter((d) => d.status !== "active").map((d) => d._id);
  const rows = await participations
    .aggregate<{ _id: string; n: number }>([
      {
        $match: {
          $or: [{ activityId: { $in: activeIds }, status: "active" }, { activityId: { $in: endedIds } }],
        },
      },
      { $group: { _id: "$activityId", n: { $sum: 1 } } },
    ])
    .toArray();
  for (const row of rows) counts.set(row._id, row.n);
  return counts;
}

async function present(doc: ActivityDoc, place?: Place | null): Promise<Activity> {
  const counts = await participantCounts([doc]);
  return toActivity(doc, counts.get(doc._id) ?? 0, place === undefined ? await getPlace(doc.placeId) : place);
}

async function findActivity(activityId: string): Promise<ActivityDoc> {
  const { activities } = await getCollections();
  const doc = await activities.findOne({ _id: activityId });
  if (!doc) throw new ApiError("NOT_FOUND", "No such activity");
  return doc;
}

/** Active activities with participant counts, newest first. Settles stale ones first. */
export async function listActiveActivities(now: Date = new Date()): Promise<Activity[]> {
  await settleStale(now);
  const { activities } = await getCollections();
  const docs = await activities.find({ status: "active" }).sort({ startedAt: -1 }).limit(200).toArray();
  const [counts, places] = await Promise.all([participantCounts(docs), getPlaces()]);
  const byId = new Map(places.map((p) => [p.id, p]));
  return docs.map((d) => toActivity(d, counts.get(d._id) ?? 0, byId.get(d.placeId)));
}

/** The user's current participation and its activity, or both null. */
export async function getActiveParticipation(userId: string, now: Date = new Date()): Promise<ActivityMe> {
  await settleStale(now);
  const { participations, activities } = await getCollections();
  const participation = await participations.findOne({ userId, status: "active" });
  if (!participation) return { participation: null, activity: null };
  const activity = await activities.findOne({ _id: participation.activityId });
  if (!activity) return { participation: null, activity: null };
  return { participation: toParticipation(participation, now), activity: await present(activity) };
}

/**
 * Host an activity: the activity and the host's participation, in one transaction. The unique
 * partial indexes reject a second active activity for the host (409 ALREADY_HOSTING) and a
 * second active participation (409 ALREADY_IN_ACTIVITY); there is no pre-check to race.
 */
export async function createActivity(user: User, body: CreateActivityBody, now: Date = new Date()): Promise<Activity> {
  await settleStale(now);
  const place = await getPlace(body.placeId);
  if (!place) throw new ApiError("BAD_REQUEST", "placeId: unknown place");
  const endsAt = body.endsAt ? new Date(body.endsAt) : undefined;
  if (endsAt && endsAt.getTime() <= now.getTime()) throw new ApiError("BAD_REQUEST", "endsAt: must be in the future");

  const activity: ActivityDoc = {
    _id: newId(),
    hostId: user.id,
    hostName: user.name?.trim() || user.email.split("@")[0],
    title: body.title,
    ...(body.description ? { description: body.description } : {}),
    placeId: place.id,
    category: body.category,
    status: "active",
    startedAt: now,
    ...(endsAt ? { endsAt } : {}),
    ...(body.capacity ? { capacity: body.capacity } : {}),
  };
  const participation: ParticipationDoc = {
    _id: newId(),
    activityId: activity._id,
    userId: user.id,
    role: "host",
    status: "active",
    joinedAt: now,
    verifiedSeconds: 0,
  };

  try {
    await withTransaction(async (session) => {
      const { activities, participations } = await getCollections();
      await activities.insertOne(activity, { session });
      await participations.insertOne(participation, { session });
    });
  } catch (error) {
    throw conflictFrom(error) ?? error;
  }

  await emit("activity.started", { activityId: activity._id, hostId: user.id, placeId: place.id, at: now });
  await emit("participation.started", {
    participationId: participation._id,
    activityId: activity._id,
    userId: user.id,
    role: "host",
    at: now,
  });
  return toActivity(activity, 1, place);
}

/** Join as a guest. 404, 409 ACTIVITY_ENDED, 409 ALREADY_IN_ACTIVITY (unique index), 409 CAPACITY_FULL. */
export async function joinActivity(user: User, activityId: string, now: Date = new Date()): Promise<ParticipationResult> {
  await settleStale(now);
  const activity = await findActivity(activityId);
  if (activity.status !== "active") throw new ApiError("ACTIVITY_ENDED", "This activity has ended");

  const { participations, activities } = await getCollections();
  const participation: ParticipationDoc = {
    _id: newId(),
    activityId,
    userId: user.id,
    role: "guest",
    status: "active",
    joinedAt: now,
    verifiedSeconds: 0,
  };
  try {
    await participations.insertOne(participation);
  } catch (error) {
    throw conflictFrom(error) ?? error;
  }

  // Capacity: insert first, then keep only the first `capacity` active participations in id
  // order (ids are time-ordered). Two racing joiners agree on who is last, so only one backs out.
  const undo = async (code: "CAPACITY_FULL" | "ACTIVITY_ENDED", message: string) => {
    await participations.deleteOne({ _id: participation._id, status: "active" });
    throw new ApiError(code, message);
  };
  if (activity.capacity) {
    const firstN = await participations
      .find({ activityId, status: "active" }, { projection: { _id: 1 } })
      .sort({ _id: 1 })
      .limit(activity.capacity)
      .toArray();
    if (!firstN.some((p) => p._id === participation._id)) await undo("CAPACITY_FULL", "This activity is full");
  }
  // It may have ended while we were inserting.
  if (!(await activities.countDocuments({ _id: activityId, status: "active" }))) {
    await undo("ACTIVITY_ENDED", "This activity has ended");
  }

  await emit("participation.started", {
    participationId: participation._id,
    activityId,
    userId: user.id,
    role: "guest",
    at: now,
  });
  return { participation: toParticipation(participation, now), activity: await present(activity) };
}

/**
 * Leave. A host who leaves ends the activity. Idempotent: leaving something already ended
 * (by you, the host or settling) returns your ended participation with its final time.
 */
export async function leaveActivity(user: User, activityId: string, now: Date = new Date()): Promise<ParticipationResult> {
  await settleStale(now);
  await findActivity(activityId);
  const { participations } = await getCollections();
  const latest = () => participations.find({ activityId, userId: user.id }).sort({ joinedAt: -1, _id: -1 }).limit(1).next();

  const mine = await latest();
  if (!mine) throw new ApiError("NOT_FOUND", "You are not in this activity");
  if (mine.status === "active") {
    if (mine.role === "host") await endActivity(activityId, now);
    else await endParticipation(mine._id, now);
  }

  const final = (await latest())!;
  return { participation: toParticipation(final, now), activity: await present(await findActivity(activityId)) };
}

/** End an activity you host; ends every participation in it. 403 for anyone else. Idempotent. */
export async function endActivityAsHost(user: User, activityId: string, now: Date = new Date()): Promise<Activity> {
  await settleStale(now);
  const activity = await findActivity(activityId);
  if (activity.hostId !== user.id) throw new ApiError("FORBIDDEN", "Only the host can end this activity");
  if (activity.status === "active") await endActivity(activityId, now);
  return present(await findActivity(activityId));
}

/** Places for the host form: `placeId` first, then the nearest to `lat,lng` (or the first few). */
export async function suggestPlaces(query: ActivityPlacesQuery, limit = 8): Promise<Place[]> {
  const places = await getPlaces();
  const origin = query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : null;
  const ordered = origin
    ? [...places].sort((a, b) => haversineM(origin, a.center) - haversineM(origin, b.center))
    : places;
  const selected = query.placeId ? places.find((p) => p.id === query.placeId) : undefined;
  return [...(selected ? [selected] : []), ...ordered.filter((p) => p !== selected)].slice(0, limit);
}
