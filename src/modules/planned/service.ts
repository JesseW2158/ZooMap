import type { AuthUser, CreatePlannedEventBody, Place, PlannedEvent, PlannedEventDoc } from "@/shared/contracts";
import { getCollections, newId } from "@/shared/db";
import { ApiError } from "@/shared/http";
import { getPlace, getPlaces } from "@/modules/campus";
import { MAX_UPCOMING_PER_HOST, checkTimes, isBigEvent } from "./rules";

type User = Pick<AuthUser, "id" | "email" | "name">;

/** Live events: not cancelled and not over. */
const live = (now: Date) => ({ cancelledAt: { $exists: false }, endsAt: { $gt: now } });

function toApi(doc: PlannedEventDoc, viewerId: string, place: Place | null | undefined): PlannedEvent {
  const goingCount = doc.goingIds.length;
  return {
    id: doc._id,
    hostId: doc.hostId,
    hostName: doc.hostName,
    title: doc.title,
    ...(doc.description ? { description: doc.description } : {}),
    placeId: doc.placeId,
    ...(place ? { placeName: place.name, placeCenter: place.center } : {}),
    category: doc.category,
    startsAt: doc.startsAt.toISOString(),
    endsAt: doc.endsAt.toISOString(),
    ...(doc.capacity ? { capacity: doc.capacity } : {}),
    goingCount,
    going: doc.goingIds.includes(viewerId),
    hosting: doc.hostId === viewerId,
    big: isBigEvent(doc.capacity, goingCount),
    createdAt: doc.createdAt.toISOString(),
  };
}

async function present(doc: PlannedEventDoc, viewerId: string): Promise<PlannedEvent> {
  return toApi(doc, viewerId, await getPlace(doc.placeId));
}

/** Coming-up events, soonest first, as `viewerId` sees them. `to` limits how far ahead. */
export async function listPlannedEvents(viewerId: string, now = new Date(), to?: Date): Promise<PlannedEvent[]> {
  const { planned_events } = await getCollections();
  const docs = await planned_events
    .find({ ...live(now), ...(to ? { startsAt: { $lte: to } } : {}) })
    .sort({ startsAt: 1 })
    .limit(200)
    .toArray();
  const places = new Map((await getPlaces()).map((p) => [p.id, p]));
  return docs.map((d) => toApi(d, viewerId, places.get(d.placeId)));
}

/** Announce an event. The host counts as going. */
export async function createPlannedEvent(user: User, body: CreatePlannedEventBody, now = new Date()): Promise<PlannedEvent> {
  const place = await getPlace(body.placeId);
  if (!place) throw new ApiError("BAD_REQUEST", "placeId: unknown place");
  const times = checkTimes(new Date(body.startsAt), body.endsAt ? new Date(body.endsAt) : undefined, now);
  if (typeof times === "string") throw new ApiError("BAD_REQUEST", times);

  const { planned_events } = await getCollections();
  if ((await planned_events.countDocuments({ hostId: user.id, ...live(now) })) >= MAX_UPCOMING_PER_HOST) {
    throw new ApiError("RATE_LIMITED", `You can have at most ${MAX_UPCOMING_PER_HOST} events coming up. Cancel one first.`);
  }
  const doc: PlannedEventDoc = {
    _id: newId(),
    hostId: user.id,
    hostName: user.name?.trim() || user.email.split("@")[0],
    title: body.title,
    ...(body.description ? { description: body.description } : {}),
    placeId: place.id,
    category: body.category,
    startsAt: times.startsAt,
    endsAt: times.endsAt,
    ...(body.capacity ? { capacity: body.capacity } : {}),
    goingIds: [user.id],
    createdAt: now,
  };
  await planned_events.insertOne(doc);
  return toApi(doc, user.id, place);
}

/** Say you are going, or not. Repeating either is harmless. A full event refuses new people. */
export async function setGoing(user: User, eventId: string, going: boolean, now = new Date()): Promise<PlannedEvent> {
  const { planned_events } = await getCollections();
  const doc = await planned_events.findOne({ _id: eventId, ...live(now) });
  if (!doc) throw new ApiError("NOT_FOUND", "No such event, or it is over");

  if (!going) {
    if (doc.hostId === user.id) throw new ApiError("CONFLICT", "You are hosting this event. Cancel it instead.");
    await planned_events.updateOne({ _id: eventId }, { $pull: { goingIds: user.id } });
  } else if (!doc.goingIds.includes(user.id)) {
    // the capacity check is in the filter, so two last-spot joins cannot both get in
    const room = doc.capacity ? { [`goingIds.${doc.capacity - 1}`]: { $exists: false } } : {};
    const res = await planned_events.updateOne({ _id: eventId, ...live(now), ...room }, { $addToSet: { goingIds: user.id } });
    if (res.matchedCount === 0) throw new ApiError("CAPACITY_FULL", "This event is full");
  }
  return present((await planned_events.findOne({ _id: eventId }))!, user.id);
}

/** Only the host can cancel. */
export async function cancelPlannedEvent(user: User, eventId: string, now = new Date()): Promise<void> {
  const { planned_events } = await getCollections();
  const doc = await planned_events.findOne({ _id: eventId, cancelledAt: { $exists: false } });
  if (!doc) throw new ApiError("NOT_FOUND", "No such event");
  if (doc.hostId !== user.id) throw new ApiError("FORBIDDEN", "Only the host can cancel this event");
  await planned_events.updateOne({ _id: eventId }, { $set: { cancelledAt: now } });
}
