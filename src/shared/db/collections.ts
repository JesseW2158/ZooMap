import type { Collection, Db } from "mongodb";
import type {
  ActivityDoc,
  ActivityInviteDoc,
  FriendshipDoc,
  MessageDoc,
  ProfileDoc,
  RateLimitDoc,
  ChainOutboxDoc,
  DeviceTokenDoc,
  HandoffCodeDoc,
  LedgerDoc,
  NotificationDoc,
  NotificationSettingsDoc,
  ParticipationDoc,
  PlannedEventDoc,
  PresenceDoc,
  RedemptionDoc,
  ScheduleConnectionDoc,
  StoreItemDoc,
  UserDoc,
} from "@/shared/contracts";
import { getDb } from "./client";

/** Collection name -> document type. The keys are the real collection names. */
export interface CollectionMap {
  users: UserDoc;
  presence: PresenceDoc;
  activities: ActivityDoc;
  participations: ParticipationDoc;
  ledger: LedgerDoc;
  store_items: StoreItemDoc;
  redemptions: RedemptionDoc;
  schedule_connections: ScheduleConnectionDoc;
  device_tokens: DeviceTokenDoc;
  handoff_codes: HandoffCodeDoc;
  chain_outbox: ChainOutboxDoc;
  profiles: ProfileDoc;
  friendships: FriendshipDoc;
  activity_invites: ActivityInviteDoc;
  rate_limits: RateLimitDoc;
  notifications: NotificationDoc;
  notification_settings: NotificationSettingsDoc;
  planned_events: PlannedEventDoc;
  messages: MessageDoc;
}

export type CollectionName = keyof CollectionMap;

export const COLLECTION_NAMES: CollectionName[] = [
  "users",
  "presence",
  "activities",
  "participations",
  "ledger",
  "store_items",
  "redemptions",
  "schedule_connections",
  "device_tokens",
  "handoff_codes",
  "chain_outbox",
  "profiles",
  "friendships",
  "activity_invites",
  "rate_limits",
  "notifications",
  "notification_settings",
  "planned_events",
  "messages",
];

export type Collections = { [K in CollectionName]: Collection<CollectionMap[K]> };

/** Typed accessors for every collection on a given database. */
export function collectionsOf(db: Db): Collections {
  return {
    users: db.collection("users"),
    presence: db.collection("presence"),
    activities: db.collection("activities"),
    participations: db.collection("participations"),
    ledger: db.collection("ledger"),
    store_items: db.collection("store_items"),
    redemptions: db.collection("redemptions"),
    schedule_connections: db.collection("schedule_connections"),
    device_tokens: db.collection("device_tokens"),
    handoff_codes: db.collection("handoff_codes"),
    chain_outbox: db.collection("chain_outbox"),
    profiles: db.collection("profiles"),
    friendships: db.collection("friendships"),
    activity_invites: db.collection("activity_invites"),
    rate_limits: db.collection("rate_limits"),
    notifications: db.collection("notifications"),
    notification_settings: db.collection("notification_settings"),
    planned_events: db.collection("planned_events"),
    messages: db.collection("messages"),
  } as Collections;
}

/** `const { users, ledger } = await getCollections()` */
export async function getCollections(): Promise<Collections> {
  return collectionsOf(await getDb());
}
