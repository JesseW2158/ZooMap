import type { Collection, Db } from "mongodb";
import type {
  ActivityDoc,
  ChainOutboxDoc,
  DeviceTokenDoc,
  HandoffCodeDoc,
  LedgerDoc,
  ParticipationDoc,
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
  } as Collections;
}

/** `const { users, ledger } = await getCollections()` */
export async function getCollections(): Promise<Collections> {
  return collectionsOf(await getDb());
}
