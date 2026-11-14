import { z } from "zod";
import { GeoJsonLineString, Id, LatLng } from "./common";
import { Place } from "./campus";

/** GET /api/places?q= : up to ten results. */
export const PlacesQuery = z.object({ q: z.string().trim().max(100).default("") });
export const PlaceList = z.array(Place);

/** `fastest` may use stairs (weighted); `stepfree` never does. Default `fastest`. */
export const RouteProfile = z.enum(["fastest", "stepfree"]);
export type RouteProfile = z.infer<typeof RouteProfile>;

/** Input to the routing module's `findRoute`. */
export const RouteInput = z.object({
  from: z.union([LatLng, z.object({ placeId: Id })]),
  to: z.object({ placeId: Id }),
  profile: RouteProfile.optional(),
});
export type RouteInput = z.infer<typeof RouteInput>;

/** GET /api/route?to=&fromLat=&fromLng= or &fromPlaceId= */
export const RouteQuery = z
  .object({
    to: Id,
    fromLat: z.coerce.number().min(-90).max(90).optional(),
    fromLng: z.coerce.number().min(-180).max(180).optional(),
    fromPlaceId: Id.optional(),
    profile: RouteProfile.optional(),
  })
  .refine(
    (q) => {
      const hasCoords = q.fromLat !== undefined && q.fromLng !== undefined;
      const hasPartialCoords = (q.fromLat === undefined) !== (q.fromLng === undefined);
      return !hasPartialCoords && hasCoords !== (q.fromPlaceId !== undefined);
    },
    { message: "give either fromLat and fromLng, or fromPlaceId" },
  );
export type RouteQuery = z.infer<typeof RouteQuery>;

/** One turn-by-turn instruction. `coordIndex` is where it starts in `line.coordinates`. */
export const RouteStep = z.object({
  text: z.string(),
  distanceM: z.number().nonnegative(),
  kind: z.enum(["start", "walk", "road", "stairs", "cross", "end"]),
  coordIndex: z.number().int().nonnegative(),
});
export type RouteStep = z.infer<typeof RouteStep>;

export const RouteResult = z.object({
  line: GeoJsonLineString,
  distanceM: z.number().nonnegative(),
  durationS: z.number().nonnegative(),
  /** Added after Phase 0 (optional): turn-by-turn directions. */
  steps: z.array(RouteStep).optional(),
  /** Added after Phase 0 (optional): flights of stairs on the route. */
  stairs: z.number().int().nonnegative().optional(),
});
export type RouteResult = z.infer<typeof RouteResult>;
