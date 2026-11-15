import type { LatLng } from "@/shared/contracts";
import { haversineM } from "@/shared/geo";

/**
 * The activity rules as constants and pure functions. No server imports, so the UI can use
 * them too (for display only: the server alone computes verified time).
 */

/** Time counts within this distance of the activity's place centre. */
export const GEOFENCE_M = 150;
/** Two in-range pings further apart than this earn nothing for the gap. */
export const MAX_PING_GAP_S = 300;
/** An activity ends when its host has had no verified ping for this long. */
export const HOST_IDLE_S = 30 * 60;
/** A guest's participation ends after this long without a verified ping. */
export const GUEST_IDLE_S = 15 * 60;

/** True when a ping at `position` counts for an activity at `placeId` / `center`. */
export function isInRange(
  ping: { position: LatLng; placeId: string | null },
  activity: { placeId: string; center: LatLng | null },
  geofenceEnforced: boolean,
): boolean {
  if (!geofenceEnforced) return true;
  // The density module resolves the ping to the place whose footprint it is in; that counts
  // even for a big building whose centre is more than 150 m away.
  if (ping.placeId !== null && ping.placeId === activity.placeId) return true;
  if (!activity.center) return false;
  return haversineM(ping.position, activity.center) <= GEOFENCE_M;
}

/**
 * Seconds a ping at `now` adds, given the previous in-range ping. Mirrors the database update
 * in `presence.ts` (which is what actually runs); kept here for the UI and for tests.
 */
export function secondsToAdd(lastVerifiedAt: Date | undefined, now: Date): number {
  if (!lastVerifiedAt) return 0;
  const gapMs = now.getTime() - lastVerifiedAt.getTime();
  if (gapMs <= 0 || gapMs >= MAX_PING_GAP_S * 1000) return 0;
  return Math.round(gapMs / 1000);
}

/** The latest ping was in range and recent. */
export function isVerifying(lastVerifiedAt: Date | undefined, now: Date): boolean {
  return !!lastVerifiedAt && now.getTime() - lastVerifiedAt.getTime() < MAX_PING_GAP_S * 1000;
}

/** What leaving now would pay, before the rewards module's caps. */
export function pendingPoints(verifiedSeconds: number, pointsPerMinute: number): number {
  return Math.floor(verifiedSeconds / 60) * pointsPerMinute;
}
