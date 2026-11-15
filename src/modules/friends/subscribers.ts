import type { EventBus } from "@/shared/events";

/**
 * Friends needs no subscriptions: invites to an activity that has ended are expired lazily
 * by `listInvites` (and by accept, through the activities module's own checks). Not listed in
 * `src/shared/events/subscribers.ts` until it subscribes to something.
 */
export function registerSubscribers(bus: EventBus): void {
  void bus;
}
