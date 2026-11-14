import type { Place, RouteInput, RouteResult } from "@/shared/contracts";
import { getPlace, getPlaces, getWalkEdgeInfo, getWalkGraph } from "@/modules/campus";
import { ApiError } from "@/shared/http";
import { createRouter, MAX_SNAP_M, type Endpoint, type Landmark, type Router } from "./engine";

/**
 * Routing module (owner: routing). Walking routes over the campus walk graph: A* with
 * stairs and roads weighted, an optional step-free profile and turn-by-turn steps.
 */

const cache = globalThis as unknown as { __zoomapRouter?: Promise<Router> };

/** Buildings worth naming in directions: the ones people know, not kiosks or annexes. */
export function landmarksFrom(places: Place[]): Landmark[] {
  return places
    .filter((p) => p.aliases.length > 0 || p.heightM >= 14 || p.category === "library" || p.category === "dining")
    .filter((p) => !/annex|skyway|garage|greenhouse/i.test(p.name))
    .map((p) => ({ name: p.name, lat: p.center.lat, lng: p.center.lng }));
}

/** Built once per server instance. */
function getRouter(): Promise<Router> {
  return (cache.__zoomapRouter ??= Promise.all([getWalkGraph(), getWalkEdgeInfo(), getPlaces()]).then(([graph, info, places]) =>
    createRouter(graph, info, landmarksFrom(places)),
  ));
}

export async function findRoute(input: RouteInput): Promise<RouteResult> {
  const router = await getRouter();
  const to = await getPlace(input.to.placeId);
  if (!to) throw new ApiError("NOT_FOUND", `Unknown place ${input.to.placeId}`);

  let from: Endpoint;
  if ("placeId" in input.from) {
    const place = await getPlace(input.from.placeId);
    if (!place) throw new ApiError("NOT_FOUND", `Unknown place ${input.from.placeId}`);
    from = { nodes: place.entranceNodes, name: place.name };
  } else {
    const snap = router.nearestNode(input.from, MAX_SNAP_M);
    if (!snap) throw new ApiError("OFF_CAMPUS", "You are too far from campus paths to route from here");
    from = { nodes: [snap.node], coord: input.from };
  }

  const outcome = router.route(from, { nodes: to.entranceNodes, name: to.name }, input.profile ?? "fastest");
  if (!outcome.ok) {
    throw outcome.error === "OFF_CAMPUS"
      ? new ApiError("OFF_CAMPUS", "You are too far from campus paths to route from here")
      : new ApiError("NO_ROUTE", `No walking route to ${to.name}`);
  }
  return outcome.result;
}
