import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventPayload, LedgerDraft } from "@/shared/contracts";
import { withTestDb } from "@/shared/db/testing";
import { bus } from "@/shared/events";
import { CATALOG } from "./catalog";
import { runRules } from "./engine";
import { applyEntry } from "./ledger";
import { getRewardsMe } from "./me";
import { TIME_AT_ACTIVITY } from "./rules/time-at-activity";
import { seed } from "./seed";
import { settleUnpaid } from "./settle";
import { listStoreItems, redeem } from "./store";

const t = withTestDb();
const USER = "seed-test-user";

async function makeUser(id = USER, pointsBalance = 0) {
  await t.cols.users.insertOne({
    _id: id,
    email: `${id}@umass.edu`,
    name: id,
    createdAt: new Date(),
    pointsBalance,
    settings: { shareLocation: false },
  });
}

/** The invariant: the cached balance always equals the ledger sum. */
async function expectBalanceMatchesLedger(userId = USER) {
  const user = await t.cols.users.findOne({ _id: userId });
  const [sum] = await t.cols.ledger.aggregate<{ total: number }>([{ $match: { userId } }, { $group: { _id: null, total: { $sum: "$delta" } } }]).toArray();
  expect(user?.pointsBalance).toBe(sum?.total ?? 0);
  expect(user?.pointsBalance).toBeGreaterThanOrEqual(0);
}

function grant(delta: number, key: string, userId = USER): LedgerDraft {
  return { userId, delta, ruleId: "test-grant", reason: "Test grant", source: { type: "test", id: key }, idempotencyKey: `test:${key}` };
}

function ended(participationId: string, verifiedSeconds: number, endedAt: Date, userId = USER): EventPayload<"participation.ended"> {
  return {
    participationId,
    activityId: "act-none",
    userId,
    role: "guest",
    joinedAt: new Date(endedAt.getTime() - verifiedSeconds * 1000),
    endedAt,
    verifiedSeconds,
  };
}

beforeEach(async () => {
  await Promise.all([t.cols.users.deleteMany({}), t.cols.participations.deleteMany({}), t.cols.ledger.deleteMany({}), t.cols.redemptions.deleteMany({}), t.cols.store_items.deleteMany({})]);
  bus.clear();
  await makeUser();
});

afterEach(() => {
  delete process.env.POINTS_PER_MINUTE;
});

describe("ledger", () => {
  it("applying the same entry twice writes one entry and moves the balance once", async () => {
    const first = await applyEntry(grant(50, "a"));
    const second = await applyEntry(grant(50, "a"));
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.entry.id).toBe(first.entry.id);
    expect(await t.cols.ledger.countDocuments({ userId: USER })).toBe(1);
    await expectBalanceMatchesLedger();
  });

  it("concurrent replays of one key still write one entry", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => applyEntry(grant(30, "race"))));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await t.cols.ledger.countDocuments({ userId: USER })).toBe(1);
    await expectBalanceMatchesLedger();
  });

  it("emits ledger.entry.created once per new entry", async () => {
    const seen: number[] = [];
    bus.on("ledger.entry.created", "test:seen", (e) => void seen.push(e.balanceAfter));
    await applyEntry(grant(20, "e1"));
    await applyEntry(grant(20, "e1"));
    await applyEntry(grant(5, "e2"));
    expect(seen).toEqual([20, 25]);
  });
});

describe("time-at-activity", () => {
  it("the same participation.ended twice pays once", async () => {
    const event = ended("p-1", 42 * 60 + 10, new Date("2026-11-14T17:00:00Z"));
    await runRules("participation.ended", event);
    await runRules("participation.ended", event);
    const entries = await t.cols.ledger.find({ userId: USER }).toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ delta: 42, ruleId: TIME_AT_ACTIVITY, idempotencyKey: "participation:p-1:time" });
    expect(entries[0].reason).toMatch(/^42 min at /);
    await expectBalanceMatchesLedger();
  });

  it("caps one participation at 240 points", async () => {
    await runRules("participation.ended", ended("p-long", 6 * 3600, new Date("2026-11-14T17:00:00Z")));
    expect((await getRewardsMe(USER)).balance).toBe(240);
  });

  it("caps a New York calendar day at 600 points", async () => {
    // Use the real clock: the cap reads entries by the time they were written.
    process.env.POINTS_PER_MINUTE = "1";
    const now = new Date();
    for (const id of ["d1", "d2", "d3", "d4"]) await runRules("participation.ended", ended(id, 4 * 3600, now), undefined, now);
    expect((await getRewardsMe(USER)).balance).toBe(600);
    expect(await t.cols.ledger.countDocuments({ userId: USER })).toBe(3); // 240 + 240 + 120, the fourth pays nothing
    await expectBalanceMatchesLedger();
  });

  it("uses POINTS_PER_MINUTE", async () => {
    process.env.POINTS_PER_MINUTE = "10";
    await runRules("participation.ended", ended("p-fast", 5 * 60, new Date()));
    expect((await getRewardsMe(USER)).balance).toBe(50);
  });

  it("is wired to the event bus", async () => {
    const { emit } = await import("@/shared/events");
    await emit("participation.ended", ended("p-bus", 3 * 60, new Date()));
    expect((await getRewardsMe(USER)).balance).toBe(3);
  });
});

describe("settling unpaid points", () => {
  const NOW = new Date("2026-11-14T18:00:00Z");
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

  async function endedParticipation(id: string, verifiedSeconds: number, leftAt: Date, userId = USER) {
    await t.cols.participations.insertOne({
      _id: id,
      activityId: "act-none",
      userId,
      role: "guest",
      status: "ended",
      joinedAt: new Date(leftAt.getTime() - verifiedSeconds * 1000),
      leftAt,
      verifiedSeconds,
    });
  }

  it("pays an ended participation whose event was never handled, once, however often it runs", async () => {
    await endedParticipation("p-lost", 30 * 60, minutesAgo(20));
    expect(await settleUnpaid(USER, NOW)).toBe(1);
    expect(await settleUnpaid(USER, NOW)).toBe(0);
    await Promise.all([settleUnpaid(USER, NOW), settleUnpaid(USER, NOW), settleUnpaid(USER, NOW)]);

    const entries = await t.cols.ledger.find({ userId: USER }).toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ delta: 30, ruleId: TIME_AT_ACTIVITY, idempotencyKey: "participation:p-lost:time" });
    expect(entries[0].createdAt).toEqual(minutesAgo(20)); // dated to when it was earned
    await expectBalanceMatchesLedger();
  });

  it("does not pay twice when the original event arrives late, or when it was already paid", async () => {
    await endedParticipation("p-paid", 10 * 60, minutesAgo(30));
    await runRules("participation.ended", ended("p-paid", 10 * 60, minutesAgo(30)), undefined, minutesAgo(30));
    expect(await settleUnpaid(USER, NOW)).toBe(0);

    await endedParticipation("p-late", 10 * 60, minutesAgo(20));
    await settleUnpaid(USER, NOW);
    await runRules("participation.ended", ended("p-late", 10 * 60, minutesAgo(20)));
    expect(await t.cols.ledger.countDocuments({ userId: USER })).toBe(2);
    expect((await t.cols.users.findOne({ _id: USER }))?.pointsBalance).toBe(20);
    await expectBalanceMatchesLedger();
  });

  it("leaves alone what is too new, too short, too old, still active, or someone else's", async () => {
    await endedParticipation("p-new", 10 * 60, new Date(NOW.getTime() - 10_000));
    await endedParticipation("p-short", 59, minutesAgo(20));
    await endedParticipation("p-old", 10 * 60, new Date(NOW.getTime() - 8 * 24 * 3_600_000));
    await endedParticipation("p-other", 10 * 60, minutesAgo(20), "seed-other-user");
    await t.cols.participations.insertOne({
      _id: "p-active", activityId: "act-none", userId: USER, role: "guest", status: "active", joinedAt: minutesAgo(30), verifiedSeconds: 600,
    });
    expect(await settleUnpaid(USER, NOW)).toBe(0);
    expect(await t.cols.ledger.countDocuments()).toBe(0);
  });

  it("keeps the daily cap: a participation capped to zero the first time stays unpaid", async () => {
    process.env.POINTS_PER_MINUTE = "1";
    const day = new Date("2026-11-14T15:00:00Z");
    for (const id of ["c1", "c2", "c3", "c4"]) {
      await endedParticipation(id, 4 * 3600, day);
      await runRules("participation.ended", ended(id, 4 * 3600, day), undefined, day);
    }
    expect(await t.cols.ledger.countDocuments({ userId: USER })).toBe(3); // 240 + 240 + 120; c4 got nothing
    expect(await settleUnpaid(USER, NOW)).toBe(0);
    expect(await t.cols.ledger.countDocuments({ userId: USER })).toBe(3);
    await expectBalanceMatchesLedger();
  });

  it("getRewardsMe pays what is owed before it reads the balance", async () => {
    await endedParticipation("p-me", 7 * 60, new Date(Date.now() - 5 * 60_000));
    expect((await getRewardsMe(USER)).balance).toBe(7);
    expect((await getRewardsMe(USER)).balance).toBe(7);
  });
});

describe("store", () => {
  beforeEach(async () => {
    await seed(t.db);
  });

  it("seeding twice keeps one copy of each item and does not reset stock", async () => {
    await t.cols.store_items.updateOne({ _id: "item-hoodie" }, { $set: { stock: 1 } });
    await seed(t.db);
    expect(await t.cols.store_items.countDocuments()).toBe(CATALOG.length);
    expect((await t.cols.store_items.findOne({ _id: "item-hoodie" }))?.stock).toBe(1);
    expect((await listStoreItems()).map((i) => i.cost)).toEqual([...CATALOG.map((i) => i.cost)].sort((a, b) => a - b));
  });

  it("redeeming spends points, writes a negative entry and issues a code", async () => {
    await applyEntry(grant(100, "fund"));
    const { redemption, created } = await redeem(USER, "item-sticker-pack", "k1");
    expect(created).toBe(true);
    expect(redemption.code).toMatch(/^ZOO-/);
    const me = await getRewardsMe(USER);
    expect(me.balance).toBe(40);
    expect(me.entries[0]).toMatchObject({ delta: -60, ruleId: "store-redemption" });
    expect(me.redemptions.map((r) => r.id)).toEqual([redemption.id]);
    await expectBalanceMatchesLedger();
  });

  it("a repeated Idempotency-Key returns the first redemption and spends nothing", async () => {
    await applyEntry(grant(200, "fund"));
    const a = await redeem(USER, "item-sticker-pack", "same");
    const b = await redeem(USER, "item-sticker-pack", "same");
    expect(b.created).toBe(false);
    expect(b.redemption).toEqual(a.redemption);
    expect((await getRewardsMe(USER)).balance).toBe(140);
    await expectBalanceMatchesLedger();
  });

  it("refuses with INSUFFICIENT_POINTS and changes nothing", async () => {
    await applyEntry(grant(10, "fund"));
    await expect(redeem(USER, "item-dining-5", "k")).rejects.toMatchObject({ code: "INSUFFICIENT_POINTS" });
    expect((await t.cols.store_items.findOne({ _id: "item-dining-5" }))?.stock).toBe(50);
    expect(await t.cols.redemptions.countDocuments()).toBe(0);
    await expectBalanceMatchesLedger();
  });

  it("refuses with OUT_OF_STOCK", async () => {
    await applyEntry(grant(5000, "fund"));
    await t.cols.store_items.updateOne({ _id: "item-hoodie" }, { $set: { stock: 0 } });
    await expect(redeem(USER, "item-hoodie", "k")).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
    await expectBalanceMatchesLedger();
  });

  it("refuses an unknown item with NOT_FOUND", async () => {
    await expect(redeem(USER, "no-such-item", "k")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("twenty concurrent redemptions against a balance that affords one: exactly one wins", async () => {
    await applyEntry(grant(60, "fund"));
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => redeem(USER, "item-sticker-pack", `c-${i}`)));
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost.every((r) => (r.reason as { code?: string }).code === "INSUFFICIENT_POINTS")).toBe(true);
    expect(await t.cols.redemptions.countDocuments()).toBe(1);
    expect((await getRewardsMe(USER)).balance).toBe(0);
    await expectBalanceMatchesLedger();
  });

  it("concurrent redemptions never take more stock than exists", async () => {
    await applyEntry(grant(100_000, "fund"));
    await t.cols.store_items.updateOne({ _id: "item-mullins-tickets" }, { $set: { stock: 2 } });
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => redeem(USER, "item-mullins-tickets", `s-${i}`)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect((await t.cols.store_items.findOne({ _id: "item-mullins-tickets" }))?.stock).toBe(0);
    await expectBalanceMatchesLedger();
  });
});
