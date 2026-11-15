import type { EventBus } from "@/shared/events";
import { ruleEventTypes, runRules } from "./engine";

/**
 * Routes each event type a reward rule listens to into the rules engine. One subscription
 * per event type, id "rewards:rules:<type>", so registering again replaces it.
 */
export function registerSubscribers(bus: EventBus): void {
  for (const type of ruleEventTypes()) {
    bus.on(type, `rewards:rules:${type}`, async (event) => {
      await runRules(type, event);
    });
  }
}
