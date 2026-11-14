import type { ScheduleEvent } from "@/shared/contracts";
import { eventsFixture } from "./fixtures";

export * as fixtures from "./fixtures";

/**
 * Schedule module (owner: schedule). FOUNDATION STUB: two made-up events. The owning stream
 * merges the user's connections, resolves places and caches; the signature stays.
 */
export async function getUpcomingEvents(userId: string, range: { from: Date; to: Date }): Promise<ScheduleEvent[]> {
  // FOUNDATION STUB
  void userId;
  return eventsFixture(range.from);
}
