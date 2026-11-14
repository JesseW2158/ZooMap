import type { ProviderConnection, ScheduleRange, ScheduleSource } from "@/shared/contracts";
import type { ProviderEvent } from "../ics";
import { googleProvider } from "./google";
import { icsProvider } from "./ics";
import { manualProvider } from "./manual";
import { planProvider } from "./plan";

/**
 * Schedule providers (the plug-in registry from contracts.md). Each returns events in the
 * requested range; they are a superset of `RawEvent` (also `allDay`, `deadline`, `course`
 * and, for hand-entered classes, `placeId`). A new calendar source is a file plus one line.
 */
export interface Provider {
  id: ScheduleSource;
  fetchEvents(connection: ProviderConnection, range: ScheduleRange): Promise<ProviderEvent[]>;
}

export const PROVIDERS: Record<ScheduleSource, Provider> = {
  ics: icsProvider,
  google: googleProvider,
  manual: manualProvider,
  plan: planProvider,
};
