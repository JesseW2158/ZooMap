import type { EventBus } from "@/shared/events";
import { onLedgerEntry, onParticipationStarted, onPresence } from "./service";

/** Alerts caused by something happening. Each saves under a key named for its cause, so a replayed event adds nothing. */
export function registerSubscribers(bus: EventBus): void {
  bus.on("presence.updated", "notifications:nearby", onPresence);
  bus.on("ledger.entry.created", "notifications:points", onLedgerEntry);
  bus.on("participation.started", "notifications:joined", onParticipationStarted);
}
