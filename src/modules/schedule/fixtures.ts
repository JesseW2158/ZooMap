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
      placeId: "w292876549",
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

/** What creating a connection returns, without a database (the route contract test uses it). */
export function createdConnectionFixture(body: { provider: "ics" | "manual"; label: string }): ScheduleConnection {
  return { id: "fixture-connection-new", provider: body.provider, label: body.label };
}
