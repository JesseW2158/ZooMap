import { describe, expect, it } from "vitest";
import { withTestDb } from "@/shared/db/testing";
import { cancelPlannedEvent, createPlannedEvent, listPlannedEvents, setGoing } from "./index";
import { checkTimes, isBigEvent } from "./rules";

const t = withTestDb();
const now = new Date("2026-11-16T15:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();
const user = (id: string) => ({ id, email: `${id}@umass.edu`, name: id });
const body = (over: object = {}) => ({ title: "Spring Concert", placeId: "w292876549", category: "social" as const, startsAt: inDays(4), ...over });

describe("rules", () => {
  it("big means 50+ spots or 15+ going", () => {
    expect(isBigEvent(50, 0)).toBe(true);
    expect(isBigEvent(undefined, 15)).toBe(true);
    expect(isBigEvent(49, 14)).toBe(false);
  });

  it("times must be in the future, within 90 days, and at most 24 hours long", () => {
    expect(checkTimes(new Date(inDays(-1)), undefined, now)).toMatch(/future/);
    expect(checkTimes(new Date(inDays(91)), undefined, now)).toMatch(/90 days/);
    expect(checkTimes(new Date(inDays(1)), new Date(inDays(3)), now)).toMatch(/24 hours/);
    expect(checkTimes(new Date(inDays(1)), new Date(inDays(0.5)), now)).toMatch(/after the start/);
    expect(checkTimes(new Date(inDays(1)), undefined, now)).toEqual({ startsAt: new Date(inDays(1)), endsAt: new Date(new Date(inDays(1)).getTime() + 7_200_000) });
  });
});

describe("planned events (database)", () => {
  it("announces an event with the host going, and lists it with counts but not names", async () => {
    const created = await createPlannedEvent(user("h1"), body({ capacity: 400 }), now);
    expect(created).toMatchObject({ goingCount: 1, going: true, hosting: true, big: true, placeName: expect.any(String) });
    const [seen] = await listPlannedEvents("v1", now);
    expect(seen).toMatchObject({ id: created.id, going: false, hosting: false, goingCount: 1 });
    expect(JSON.stringify(seen)).not.toContain("goingIds");
  });

  it("rejects an unknown place and bad times", async () => {
    await expect(createPlannedEvent(user("h2"), body({ placeId: "nope" }), now)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(createPlannedEvent(user("h2"), body({ startsAt: inDays(-1) }), now)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("limits a host to five coming up", async () => {
    for (let i = 0; i < 5; i++) await createPlannedEvent(user("h3"), body({ title: `E${i}` }), now);
    await expect(createPlannedEvent(user("h3"), body(), now)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("going is idempotent, can be undone, and stops at capacity", async () => {
    const e = await createPlannedEvent(user("h4"), body({ capacity: 2 }), now);
    expect((await setGoing(user("a"), e.id, true, now)).goingCount).toBe(2);
    expect((await setGoing(user("a"), e.id, true, now)).goingCount).toBe(2);
    await expect(setGoing(user("b"), e.id, true, now)).rejects.toMatchObject({ code: "CAPACITY_FULL" });
    expect((await setGoing(user("a"), e.id, false, now)).going).toBe(false);
    expect((await setGoing(user("b"), e.id, true, now)).going).toBe(true);
    await expect(setGoing(user("h4"), e.id, false, now)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("only the host can cancel; a cancelled or finished event is gone from the list", async () => {
    const e = await createPlannedEvent(user("h5"), body({ title: "Cancel me" }), now);
    await expect(cancelPlannedEvent(user("x"), e.id, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await cancelPlannedEvent(user("h5"), e.id, now);
    expect((await listPlannedEvents("v", now)).some((x) => x.id === e.id)).toBe(false);
    await expect(setGoing(user("v"), e.id, true, now)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const done = await createPlannedEvent(user("h6"), body({ title: "Over", startsAt: inDays(1) }), now);
    expect((await listPlannedEvents("v", new Date(inDays(2)))).some((x) => x.id === done.id)).toBe(false);
    expect(await t.cols.planned_events.countDocuments({ _id: done.id })).toBe(1);
  });
});
