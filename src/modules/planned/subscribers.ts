import type { EventBus } from "@/shared/events";

/** Planned events listen to nothing; notifications reads them when it builds alerts. */
export function registerSubscribers(bus: EventBus): void {
  void bus;
}
