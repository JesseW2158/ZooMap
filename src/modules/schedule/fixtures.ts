import type { ScheduleConnection, ScheduleEvent } from "@/shared/contracts";

/** Two events relative to `from`, one at a campus place and one whose location did not resolve. */
export function eventsFixture(from: Date): ScheduleEvent[] {
  const at = (minutes: number) => new Date(from.getTime() + minutes * 60_000).toISOString();
  return [
    {
      id: "fixture-event-1",
      source: "ics",
      title: "COMPSCI 187 Lecture",
      start: at(60),
      end: at(135),
      locationText: "ILC S131",
      placeId: "fx-ilc",
    },
    {
      id: "fixture-event-2",
      source: "ics",
      title: "Office hours",
      start: at(240),
      end: at(300),
      locationText: "Somewhere off campus",
    },
  ];
}

export const connectionsFixture: ScheduleConnection[] = [{ id: "fixture-connection-1", provider: "ics", label: "Canvas (fixture)" }];
