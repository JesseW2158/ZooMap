import type { EventBus } from "@/shared/events";
import { recordPresence } from "./presence";

/** Each presence ping settles stale activities and adds verified time to the user's participation. */
export function registerSubscribers(bus: EventBus): void {
  bus.on("presence.updated", "activities:verified-time", recordPresence);
}
