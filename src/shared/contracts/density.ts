import { z } from "zod";
import { Id, IsoTime, LatLng } from "./common";

export const PlaceCount = z.object({ placeId: Id, count: z.number().int().nonnegative() });
export type PlaceCount = z.infer<typeof PlaceCount>;

/** 0 = empty, 4 = packed. */
export const DensityLevel = z.number().int().min(0).max(4);
export type DensityLevel = z.infer<typeof DensityLevel>;

export const DensitySourceKind = z.enum(["live", "simulated"]);
export type DensitySourceKind = z.infer<typeof DensitySourceKind>;

export const DensityPoint = LatLng.extend({
  weight: z.number().nonnegative(),
  source: DensitySourceKind,
});
export type DensityPoint = z.infer<typeof DensityPoint>;

export const DensityPlace = z.object({
  placeId: Id,
  /** live + simulated */
  count: z.number().int().nonnegative(),
  live: z.number().int().nonnegative(),
  simulated: z.number().int().nonnegative(),
  level: DensityLevel,
});
export type DensityPlace = z.infer<typeof DensityPlace>;

/** GET /api/density. Simulated data is always labelled: `hasSimulated` and per-place `simulated`. */
export const DensityResponse = z.object({
  generatedAt: IsoTime,
  hasSimulated: z.boolean(),
  points: z.array(DensityPoint),
  places: z.array(DensityPlace),
});
export type DensityResponse = z.infer<typeof DensityResponse>;

/** POST /api/presence/ping */
export const PingBody = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().optional(),
});
export type PingBody = z.infer<typeof PingBody>;

export const PingResponse = z.object({
  placeId: Id.nullable(),
  expiresAt: IsoTime,
});
export type PingResponse = z.infer<typeof PingResponse>;

/** PUT /api/presence/sharing, and GET (added so a client can read the flag). */
export const SharingBody = z.strictObject({ enabled: z.boolean() });
export type SharingBody = z.infer<typeof SharingBody>;
export const SharingState = z.object({ enabled: z.boolean() });
export type SharingState = z.infer<typeof SharingState>;

/** Where a ping came from: the website, or the Android shell's device token. */
export const PresenceSource = z.enum(["web", "native"]);
export type PresenceSource = z.infer<typeof PresenceSource>;
