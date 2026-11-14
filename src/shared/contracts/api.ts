import { z } from "zod";
import { ActivityList, ActivityMe, CreateActivityBody, Activity, ParticipationResult } from "./activities";
import { PlaceList, PlacesQuery, RouteQuery, RouteResult } from "./routing";
import { BuildingCollection, GroundCollection } from "./campus";
import { DensityResponse, PingBody, PingResponse, SharingBody, SharingState } from "./density";
import { RecommendBody, RecommendResponse } from "./recommend";
import { RedeemBody, Redemption, RewardsMe, StoreItemList } from "./rewards";
import {
  CreateConnectionBody,
  DeleteConnectionQuery,
  ScheduleConnection,
  ScheduleConnectionList,
  UpdateConnectionBody,
  ScheduleEventList,
  ScheduleEventsQuery,
} from "./schedule";
import { ChainMe, DeviceTokenResponse } from "./platform";
import { Ok } from "./common";

/**
 * Every JSON route, its validators and its success body. The route stubs parse their
 * fixtures against `response`, and `src/app/api/routes.test.ts` walks this table, so a
 * route that drifts from its schema fails a test. Redirect routes (Google OAuth) and
 * Auth.js's own `/api/auth/*` are not listed. Success is the bare payload; failure is
 * `ErrorEnvelope` with the code's HTTP status.
 *
 * `status` is the success status. `path` uses `[param]` like the file system.
 */
export interface ApiRouteSpec {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  status: 200 | 201;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
  /** Required request headers beyond auth. */
  headers?: string[];
}

export const API_ROUTES = {
  placesSearch: { path: "/api/places", method: "GET", status: 200, query: PlacesQuery, response: PlaceList },
  route: { path: "/api/route", method: "GET", status: 200, query: RouteQuery, response: RouteResult },
  campusBuildings: { path: "/api/campus/buildings", method: "GET", status: 200, response: BuildingCollection },
  campusGround: { path: "/api/campus/ground", method: "GET", status: 200, response: GroundCollection },
  density: { path: "/api/density", method: "GET", status: 200, response: DensityResponse },
  presencePing: { path: "/api/presence/ping", method: "POST", status: 200, body: PingBody, response: PingResponse },
  presenceSharingGet: { path: "/api/presence/sharing", method: "GET", status: 200, response: SharingState },
  presenceSharingSet: { path: "/api/presence/sharing", method: "PUT", status: 200, body: SharingBody, response: SharingState },
  activitiesList: { path: "/api/activities", method: "GET", status: 200, response: ActivityList },
  activitiesCreate: { path: "/api/activities", method: "POST", status: 201, body: CreateActivityBody, response: Activity },
  activitiesMe: { path: "/api/activities/me", method: "GET", status: 200, response: ActivityMe },
  activitiesJoin: { path: "/api/activities/[id]/join", method: "POST", status: 200, response: ParticipationResult },
  activitiesLeave: { path: "/api/activities/[id]/leave", method: "POST", status: 200, response: ParticipationResult },
  activitiesEnd: { path: "/api/activities/[id]/end", method: "POST", status: 200, response: Activity },
  rewardsMe: { path: "/api/rewards/me", method: "GET", status: 200, response: RewardsMe },
  storeItems: { path: "/api/store/items", method: "GET", status: 200, response: StoreItemList },
  storeRedeem: {
    path: "/api/store/redeem",
    method: "POST",
    status: 201,
    body: RedeemBody,
    response: Redemption,
    headers: ["Idempotency-Key"],
  },
  scheduleEvents: { path: "/api/schedule/events", method: "GET", status: 200, query: ScheduleEventsQuery, response: ScheduleEventList },
  scheduleConnectionsList: { path: "/api/schedule/connections", method: "GET", status: 200, response: ScheduleConnectionList },
  scheduleConnectionsCreate: {
    path: "/api/schedule/connections",
    method: "POST",
    status: 201,
    body: CreateConnectionBody,
    response: ScheduleConnection,
  },
  scheduleConnectionsUpdate: {
    path: "/api/schedule/connections",
    method: "PUT",
    status: 200,
    body: UpdateConnectionBody,
    response: ScheduleConnection,
  },
  scheduleConnectionsDelete: {
    path: "/api/schedule/connections",
    method: "DELETE",
    status: 200,
    query: DeleteConnectionQuery,
    response: Ok,
  },
  recommend: { path: "/api/recommend", method: "POST", status: 200, body: RecommendBody, response: RecommendResponse },
  mobileDeviceToken: { path: "/api/mobile/device-token", method: "POST", status: 201, response: DeviceTokenResponse },
  chainMe: { path: "/api/chain/me", method: "GET", status: 200, response: ChainMe },
} as const satisfies Record<string, ApiRouteSpec>;

export type ApiRouteName = keyof typeof API_ROUTES;
