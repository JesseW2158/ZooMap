import type { EventPayload, EventType } from "@/shared/contracts";
import { bus } from "./bus";

export { bus, createEventBus } from "./bus";
export type { EventBus, EventHandler } from "./bus";

/**
 * Announce a fact. In-process, awaited in order, subscribers' errors never reach you.
 *
 *   await emit("participation.ended", { participationId, ... });
 *
 * Subscribers are registered on first use, so an emitting route never has to import them.
 */
export async function emit<K extends EventType>(type: K, payload: EventPayload<K>): Promise<void> {
  // Dynamic import: subscribers.ts imports every module, and modules import this file.
  // Re-running registration is cheap and picks up edited subscribers after a hot reload.
  const { registerAllSubscribers } = await import("./subscribers");
  registerAllSubscribers(bus);
  await bus.emit(type, payload);
}
