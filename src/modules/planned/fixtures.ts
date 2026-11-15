import type { CreatePlannedEventBody, PlannedEvent } from "@/shared/contracts";

/** A believable planned event for route tests and UI work. */
export function plannedEventFixture(now: Date, over: Partial<PlannedEvent> = {}): PlannedEvent {
  const at = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();
  return {
    id: "fixture-planned-1",
    hostId: "seed-blair",
    hostName: "Blair Dev",
    title: "Spring Concert",
    placeId: "w51650200",
    placeName: "Computer Science Building",
    category: "social",
    startsAt: at(72),
    endsAt: at(75),
    capacity: 400,
    goingCount: 120,
    going: false,
    hosting: false,
    big: true,
    createdAt: at(-2),
    ...over,
  };
}

export function createdPlannedEventFixture(body: CreatePlannedEventBody, host: { id: string; name: string }, now: Date): PlannedEvent {
  return plannedEventFixture(now, {
    id: "fixture-planned-new",
    hostId: host.id,
    hostName: host.name,
    title: body.title,
    placeId: body.placeId,
    category: body.category,
    startsAt: body.startsAt,
    endsAt: body.endsAt ?? new Date(new Date(body.startsAt).getTime() + 7_200_000).toISOString(),
    capacity: body.capacity,
    goingCount: 1,
    going: true,
    hosting: true,
    big: (body.capacity ?? 0) >= 50,
    createdAt: now.toISOString(),
  });
}
