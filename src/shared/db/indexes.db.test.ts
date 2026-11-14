import { describe, expect, it } from "vitest";
import { duplicateKeyIndexName, isDuplicateKeyError, newId } from "./helpers";
import { INDEXES } from "./indexes";
import { withTestDb } from "./testing";

/** Needs MONGODB_URI. Works in `${MONGODB_DB}_test`. See `withTestDb`. */
const t = withTestDb();

const NOW = new Date();
const activity = (hostId: string, status: "active" | "ended" = "active") => ({
  _id: newId(),
  hostId,
  hostName: "Host",
  title: "Study",
  placeId: "fx-ilc",
  category: "study" as const,
  status,
  startedAt: NOW,
  createdAt: NOW,
});
const participation = (userId: string, status: "active" | "ended" = "active") => ({
  _id: newId(),
  activityId: "a1",
  userId,
  role: "guest" as const,
  status,
  joinedAt: NOW,
});

async function insertError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the insert to fail");
}

describe("withTestDb", () => {
  it("works in a database whose name ends in _test and starts empty", async () => {
    expect(t.db.databaseName.endsWith("_test")).toBe(true);
    expect(await t.cols.users.countDocuments()).toBe(0);
  });

  it("created every declared index", async () => {
    for (const { collection, options } of INDEXES) {
      const existing = await t.db.collection(collection).indexes();
      const name = options?.name;
      if (name) expect(existing.map((i) => i.name), `${collection}.${name}`).toContain(name);
    }
  });
});

describe("one hosted activity per user", () => {
  it("a second active activity for the same host fails with a duplicate-key error", async () => {
    await t.cols.activities.insertOne(activity("host-1") as never);
    const error = await insertError(() => t.cols.activities.insertOne(activity("host-1") as never));
    expect(isDuplicateKeyError(error)).toBe(true);
    expect(duplicateKeyIndexName(error)).toBe("one_active_host_unique");
  });

  it("an ended activity does not block a new one, and other hosts are unaffected", async () => {
    await t.cols.activities.insertOne(activity("host-2", "ended") as never);
    await t.cols.activities.insertOne(activity("host-2") as never);
    await t.cols.activities.insertOne(activity("host-3") as never);
    expect(await t.cols.activities.countDocuments({ hostId: "host-2" })).toBe(2);
  });
});

describe("one activity at a time", () => {
  it("a second active participation for the same user fails; ended ones do not count", async () => {
    await t.cols.participations.insertOne(participation("user-1") as never);
    const error = await insertError(() => t.cols.participations.insertOne(participation("user-1") as never));
    expect(isDuplicateKeyError(error)).toBe(true);
    expect(duplicateKeyIndexName(error)).toBe("one_active_participation_unique");

    await t.cols.participations.insertOne(participation("user-2", "ended") as never);
    await t.cols.participations.insertOne(participation("user-2") as never);
  });
});

describe("ledger idempotency", () => {
  it("a repeated idempotency key is rejected", async () => {
    const entry = (key: string) => ({
      _id: newId(),
      userId: "user-1",
      delta: 10,
      ruleId: "time-at-activity",
      idempotencyKey: key,
      balanceAfter: 10,
      createdAt: NOW,
    });
    await t.cols.ledger.insertOne(entry("k1") as never);
    expect(isDuplicateKeyError(await insertError(() => t.cols.ledger.insertOne(entry("k1") as never)))).toBe(true);
    await t.cols.ledger.insertOne(entry("k2") as never);
  });
});
