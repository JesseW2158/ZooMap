import { z } from "zod";

/**
 * Conventions (see docs/plan/contracts.md):
 * - Ids are strings. Every MongoDB `_id` and every reference to one is a string
 *   (an ObjectId hex string made by `newId()` in `@/shared/db`), never an ObjectId,
 *   so no module ever converts between the two.
 * - Times are ISO 8601 strings in APIs and `Date` in MongoDB and in-process events.
 * - Coordinates are `{ lat, lng }` in APIs and `[lng, lat]` in GeoJSON.
 */

export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;

/** ISO 8601 timestamp, UTC or with an offset. `new Date().toISOString()` always passes. */
export const IsoTime = z.iso.datetime({ offset: true });
export type IsoTime = z.infer<typeof IsoTime>;

export const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLng>;

/** GeoJSON position: [lng, lat]. */
export const LngLat = z.tuple([z.number(), z.number()]);
export type LngLat = z.infer<typeof LngLat>;

export const GeoJsonLineString = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(LngLat).min(2),
});
export type GeoJsonLineString = z.infer<typeof GeoJsonLineString>;

export const GeoJsonMultiLineString = z.object({
  type: z.literal("MultiLineString"),
  coordinates: z.array(z.array(LngLat).min(2)),
});

export const GeoJsonPolygon = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(LngLat).min(4)).min(1),
});
export type GeoJsonPolygon = z.infer<typeof GeoJsonPolygon>;

export const GeoJsonMultiPolygon = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(z.array(LngLat).min(4)).min(1)),
});

/**
 * Every machine-readable error code an API route may return. Adding a code is an
 * additive contract change. Each code has exactly one HTTP status (ERROR_STATUS).
 */
export const ERROR_STATUS = {
  BAD_REQUEST: 400, // body, query or header failed validation
  UNAUTHORIZED: 401, // no valid session or device token
  FORBIDDEN: 403, // signed in but not allowed (also: wrong email domain)
  SHARING_OFF: 403, // presence ping while the user's location sharing is off
  NOT_FOUND: 404,
  NO_ROUTE: 404, // routing: both ends are on the graph but not connected
  CONFLICT: 409, // generic state conflict
  ALREADY_HOSTING: 409, // unique partial index on activities.hostId
  ALREADY_IN_ACTIVITY: 409, // unique partial index on participations.userId
  CAPACITY_FULL: 409, // activity at capacity
  ACTIVITY_ENDED: 409, // join/leave on an ended activity
  INSUFFICIENT_POINTS: 409, // redeem with a balance below the cost
  OUT_OF_STOCK: 409, // redeem an item with no stock left
  OFF_CAMPUS: 422, // routing: start is farther than 150 m from the graph
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  NOT_IMPLEMENTED: 501, // a stub with no sensible fixture
  NOT_CONFIGURED: 503, // a feature needs an env var that is unset (for example GEMINI_API_KEY)
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];
export const ErrorCodeSchema = z.enum(ERROR_CODES);

/** Failure body for every route: `{ error: { code, message } }` with the matching HTTP status. */
export const ErrorEnvelope = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

/** Generic acknowledgement for routes that return nothing else. */
export const Ok = z.object({ ok: z.literal(true) });
export type Ok = z.infer<typeof Ok>;

/** Header required by POST /api/store/redeem. */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";
