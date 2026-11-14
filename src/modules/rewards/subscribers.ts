import type { EventBus } from "@/shared/events";

/**
 * Event subscribers for this module. The rewards stream routes `participation.ended` (and
 * later events) to its reward rules here. Subscription ids look like "rewards:<what>".
 */
export function registerSubscribers(bus: EventBus): void {
  void bus;
}
