import { z } from "zod";
import { ActivityList, ActivityMe, ActivityPlacesQuery, CreateActivityBody, Activity, ParticipationResult } from "./activities";
import { PlaceList, PlacesQuery, RouteQuery, RouteResult } from "./routing";
import { BuildingCollection, GroundCollection } from "./campus";
import { DensityResponse, PingBody, PingResponse, SharingBody, SharingState } from "./density";
import { RecommendBody, RecommendResponse } from "./recommend";
import { ChatBody, ChatResponse } from "./assistant";
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
import {
  AcceptInviteBody,
  AddFriendBody,
  Friend,
  FriendCode,
  FriendList,
  FriendPreview,
  FriendPreviewQuery,
  InviteBody,
  InviteList,
  InviteResult,
  Profile,
  ProfileUpdateBody,
} from "./friends";
import { Ok } from "./common";
import { AlertSettings, AlertSettingsBody, MarkReadBody, NotificationsResponse } from "./notifications";
import { CreatePlannedEventBody, GoingBody, PlannedEvent, PlannedEventList } from "./planned";

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
  activitiesPlaces: { path: "/api/activities/places", method: "GET", status: 200, query: ActivityPlacesQuery, response: PlaceList },
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
  /** Added after Phase 0: the campus chatbot. */
  assistantChat: { path: "/api/assistant/chat", method: "POST", status: 200, body: ChatBody, response: ChatResponse },
  mobileDeviceToken: { path: "/api/mobile/device-token", method: "POST", status: 201, response: DeviceTokenResponse },
  chainMe: { path: "/api/chain/me", method: "GET", status: 200, response: ChainMe },
  profileMe: { path: "/api/profile/me", method: "GET", status: 200, response: Profile },
  profileUpdate: { path: "/api/profile/me", method: "PUT", status: 200, body: ProfileUpdateBody, response: Profile },
  profileGet: { path: "/api/profile/[id]", method: "GET", status: 200, response: Profile },
  friendsList: { path: "/api/friends", method: "GET", status: 200, response: FriendList },
  friendsAdd: { path: "/api/friends", method: "POST", status: 200, body: AddFriendBody, response: Friend },
  friendsRemove: { path: "/api/friends/[id]", method: "DELETE", status: 200, response: Ok },
  friendCodeNew: { path: "/api/friends/code", method: "POST", status: 200, response: FriendCode },
  friendPreview: { path: "/api/friends/preview", method: "GET", status: 200, query: FriendPreviewQuery, response: FriendPreview },
  invitesList: { path: "/api/friends/invites", method: "GET", status: 200, response: InviteList },
  invitesSend: { path: "/api/friends/invites", method: "POST", status: 200, body: InviteBody, response: InviteResult },
  inviteAccept: {
    path: "/api/friends/invites/[id]/accept",
    method: "POST",
    status: 200,
    body: AcceptInviteBody,
    response: ParticipationResult,
  },
  inviteDecline: { path: "/api/friends/invites/[id]/decline", method: "POST", status: 200, response: Ok },
  notificationsList: { path: "/api/notifications", method: "GET", status: 200, response: NotificationsResponse },
  notificationsRead: { path: "/api/notifications/read", method: "POST", status: 200, body: MarkReadBody, response: Ok },
  notificationsSettings: { path: "/api/notifications/settings", method: "PUT", status: 200, body: AlertSettingsBody, response: AlertSettings },
  plannedEventsList: { path: "/api/planned-events", method: "GET", status: 200, response: PlannedEventList },
  plannedEventsCreate: { path: "/api/planned-events", method: "POST", status: 201, body: CreatePlannedEventBody, response: PlannedEvent },
  plannedEventGoing: { path: "/api/planned-events/[id]/going", method: "POST", status: 200, body: GoingBody, response: PlannedEvent },
  plannedEventCancel: { path: "/api/planned-events/[id]", method: "DELETE", status: 200, response: Ok },
} as const satisfies Record<string, ApiRouteSpec>;

export type ApiRouteName = keyof typeof API_ROUTES;
