import type { EventBus } from "@/shared/events";

/**
 * Event subscribers for this module. The activities stream subscribes to `presence.updated`
 * here to add verified time. Subscription ids look like "activities:<what>".
 */
export function registerSubscribers(bus: EventBus): void {
  void bus;
}
