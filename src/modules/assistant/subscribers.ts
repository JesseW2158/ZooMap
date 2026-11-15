import type { EventBus } from "@/shared/events";

/**
 * Event subscribers for this module (none). Not listed in `src/shared/events/subscribers.ts`
 * (frozen); add it there if this ever subscribes to something.
 */
export function registerSubscribers(bus: EventBus): void {
  void bus;
}
