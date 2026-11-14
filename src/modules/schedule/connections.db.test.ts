import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { withTestDb } from "@/shared/db/testing";
import { createConnection, deleteConnection, getUpcomingEvents, listConnections } from "./index";

const t = withTestDb();
const FEED = "https://umamherst.instructure.com/feeds/calendars/user_secret123.ics";

beforeAll(() => {
  process.env.ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
});

describe("schedule connections (database)", () => {
  it("stores a feed link encrypted and never returns it", async () => {
    const created = await createConnection("u1", { provider: "ics", label: "Canvas", url: FEED });
    expect(JSON.stringify(created)).not.toContain("secret123");

    const doc = await t.cols.schedule_connections.findOne({ _id: created.id });
    expect(doc?.secretEnc).toBeDefined();
    expect(doc?.secretEnc).not.toContain("secret123");

    const listed = await listConnections("u1");
    expect(listed.map((c) => c.id)).toContain(created.id);
    expect(JSON.stringify(listed)).not.toContain("secret123");
    expect(JSON.stringify(listed)).not.toContain("secretEnc");
  });

  it("refuses a link from a host that is not allowed", async () => {
    await expect(createConnection("u1", { provider: "ics", label: "Bad", url: "https://evil.example.com/x.ics" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("stores a hand-entered class and expands it into events at its building", async () => {
    const created = await createConnection("u2", { provider: "manual", label: "CICS 210", placeId: "w292876549", room: "S131", days: ["MO", "WE", "FR"], start: "10:10", end: "11:00" });
    expect(created.summary).toBe("MWF 10:10am–11:00am · ILC S131");
    const events = await getUpcomingEvents("u2", { from: new Date("2026-11-02T00:00:00Z"), to: new Date("2026-11-07T00:00:00Z") });
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.placeId === "w292876549" && e.source === "manual")).toBe(true);
  });

  it("lets a user delete only their own connections", async () => {
    const created = await createConnection("u3", { provider: "manual", label: "MATH 132", days: ["TU"], start: "09:00", end: "10:15" });
    await expect(deleteConnection("someone-else", created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await deleteConnection("u3", created.id);
    expect(await listConnections("u3")).toEqual([]);
  });
});
