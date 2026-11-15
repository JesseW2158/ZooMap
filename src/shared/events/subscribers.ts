// The one place that lists every module's event subscribers. Complete after Phase 0:
// each module already has a `subscribers.ts`; its stream fills it in.
// (The only shared file allowed to import module internals; see eslint.config.mjs.)
import { registerSubscribers as activities } from "@/modules/activities/subscribers";
import { registerSubscribers as auth } from "@/modules/auth/subscribers";
import { registerSubscribers as campus } from "@/modules/campus/subscribers";
import { registerSubscribers as chain } from "@/modules/chain/subscribers";
import { registerSubscribers as density } from "@/modules/density/subscribers";
import { registerSubscribers as mobile } from "@/modules/mobile/subscribers";
import { registerSubscribers as notifications } from "@/modules/notifications/subscribers";
import { registerSubscribers as recommend } from "@/modules/recommend/subscribers";
import { registerSubscribers as rewards } from "@/modules/rewards/subscribers";
import { registerSubscribers as routing } from "@/modules/routing/subscribers";
import { registerSubscribers as schedule } from "@/modules/schedule/subscribers";
import type { EventBus } from "./bus";

const ALL = [activities, auth, campus, chain, density, mobile, notifications, recommend, rewards, routing, schedule];

/** Registers every module's subscribers on `bus`. Safe to call repeatedly (subscriptions are keyed by id). */
export function registerAllSubscribers(bus: EventBus): void {
  for (const register of ALL) register(bus);
}
