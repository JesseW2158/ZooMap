import type { RouteInput, RouteResult } from "@/shared/contracts";
import { getPlace } from "@/modules/campus";
import { ApiError } from "@/shared/http";
import { haversineM, toLngLat } from "@/shared/geo";

const WALK_SPEED_M_PER_S = 1.35;

/**
 * Routing module (owner: routing). FOUNDATION STUB: a straight line between the two ends,
 * not a path over the walk graph. The owning stream replaces the body with A* over
 * `getWalkGraph()`; the signature and the error codes (NOT_FOUND for an unknown place,
 * OFF_CAMPUS, NO_ROUTE) stay.
 */
export async function findRoute(input: RouteInput): Promise<RouteResult> {
  // FOUNDATION STUB
  const to = await getPlace(input.to.placeId);
  if (!to) throw new ApiError("NOT_FOUND", `Unknown place ${input.to.placeId}`);

  let from;
  if ("placeId" in input.from) {
    const place = await getPlace(input.from.placeId);
    if (!place) throw new ApiError("NOT_FOUND", `Unknown place ${input.from.placeId}`);
    from = place.center;
  } else {
    from = input.from;
  }

  const distanceM = haversineM(from, to.center);
  return {
    line: { type: "LineString", coordinates: [toLngLat(from), toLngLat(to.center)] },
    distanceM: Math.round(distanceM),
    durationS: Math.round(distanceM / WALK_SPEED_M_PER_S),
  };
}
