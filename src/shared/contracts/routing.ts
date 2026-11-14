import { z } from "zod";
import { GeoJsonLineString, Id, LatLng } from "./common";
import { Place } from "./campus";

/** GET /api/places?q= : up to ten results. */
export const PlacesQuery = z.object({ q: z.string().trim().max(100).default("") });
export const PlaceList = z.array(Place);

/** Input to the routing module's `findRoute`. */
export const RouteInput = z.object({
  from: z.union([LatLng, z.object({ placeId: Id })]),
  to: z.object({ placeId: Id }),
});
export type RouteInput = z.infer<typeof RouteInput>;

/** GET /api/route?to=&fromLat=&fromLng= or &fromPlaceId= */
export const RouteQuery = z
  .object({
    to: Id,
    fromLat: z.coerce.number().min(-90).max(90).optional(),
    fromLng: z.coerce.number().min(-180).max(180).optional(),
    fromPlaceId: Id.optional(),
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

export const RouteResult = z.object({
  line: GeoJsonLineString,
  distanceM: z.number().nonnegative(),
  durationS: z.number().nonnegative(),
});
export type RouteResult = z.infer<typeof RouteResult>;
