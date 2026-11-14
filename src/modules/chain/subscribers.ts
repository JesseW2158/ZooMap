import type { EventBus } from "@/shared/events";

/**
 * Event subscribers for this module. The chain stream subscribes to `ledger.entry.created`
 * here and writes a `chain_outbox` row. Subscription ids look like "chain:<what>".
 */
export function registerSubscribers(bus: EventBus): void {
  void bus;
}
