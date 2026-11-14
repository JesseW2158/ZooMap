import { latLngToCell } from "h3-js";
import type { LatLng, PresenceSource } from "@/shared/contracts";
import { getCollections } from "@/shared/db";
import { ApiError } from "@/shared/http";
import { emit } from "@/shared/events";
import { nearestPlace } from "@/modules/campus";

export const H3_RESOLUTION = 10;
export const PRESENCE_TTL_MS = 10 * 60_000;
const PLACE_RADIUS_M = 60;

export async function getSharing(userId: string): Promise<boolean> {
  const { users } = await getCollections();
  const user = await users.findOne({ _id: userId }, { projection: { settings: 1 } });
  return user?.settings?.shareLocation === true;
}

/** Turning sharing off deletes the presence document at once. */
export async function setSharing(userId: string, enabled: boolean): Promise<boolean> {
  const { users, presence } = await getCollections();
  const res = await users.updateOne({ _id: userId }, { $set: { "settings.shareLocation": enabled } });
  if (res.matchedCount === 0) throw new ApiError("NOT_FOUND", "User not found");
  if (!enabled) await presence.deleteOne({ _id: userId });
  return enabled;
}

/**
 * Record a ping. Stores the H3 cell and place only: the coordinates go out on the
 * `presence.updated` event and nowhere else.
 */
export async function recordPing(
  userId: string,
  pos: LatLng,
  source: PresenceSource,
  now: Date = new Date(),
): Promise<{ placeId: string | null; expiresAt: Date }> {
  if (!(await getSharing(userId))) throw new ApiError("SHARING_OFF", "Location sharing is off");

  const near = await nearestPlace(pos, PLACE_RADIUS_M);
  const placeId = near?.place.id ?? null;
  const expiresAt = new Date(now.getTime() + PRESENCE_TTL_MS);
  const { presence } = await getCollections();
  await presence.replaceOne(
    { _id: userId },
    { h3: latLngToCell(pos.lat, pos.lng, H3_RESOLUTION), placeId, source, updatedAt: now, expiresAt },
    { upsert: true },
  );
  // Sharing may have been switched off while this ping was in flight: setSharing deleted the
  // document, and the upsert above would have brought it back. Re-check, and undo if so.
  if (!(await getSharing(userId))) {
    await presence.deleteOne({ _id: userId });
    throw new ApiError("SHARING_OFF", "Location sharing is off");
  }
  await emit("presence.updated", { userId, position: { lat: pos.lat, lng: pos.lng }, placeId, at: now });
  return { placeId, expiresAt };
}
