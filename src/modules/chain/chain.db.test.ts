import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withTestDb } from "@/shared/db/testing";
import { bus, emit } from "@/shared/events";
import { applyEntry } from "@/modules/rewards";
import type { ChainClient, TxStatus } from "./client";
import { OUTBOX } from "./config";
import { getChainSummary } from "./index";
import { drainOutbox, enqueue } from "./outbox";

const t = withTestDb();
const USER = "seed-chain-user";

// .env.local may hold real CHAIN_* keys; these tests must never reach devnet.
const CHAIN_VARS = ["CHAIN_MINT_ADDRESS", "CHAIN_AUTHORITY_SECRET", "CHAIN_USER_SEED", "SOLANA_RPC_URL"] as const;
const savedEnv = Object.fromEntries(CHAIN_VARS.map((v) => [v, process.env[v]]));
beforeAll(() => CHAIN_VARS.forEach((v) => delete process.env[v]));
afterAll(() => CHAIN_VARS.forEach((v) => (savedEnv[v] === undefined ? delete process.env[v] : (process.env[v] = savedEnv[v]))));

class FakeChain implements ChainClient {
  prepared: { userId: string; delta: number; signature: string }[] = [];
  sent: string[] = [];
  statuses = new Map<string, TxStatus>();
  failPrepare = false;
  confirmAs: TxStatus = "confirmed";
  delayMs = 0;
  private n = 0;

  async prepare(op: { userId: string; delta: number }) {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failPrepare) throw new Error("devnet is down");
    const signature = `sig-${++this.n}`;
    this.prepared.push({ ...op, signature });
    return { signature, send: async () => void this.sent.push(signature) };
  }
  async confirm(signature: string) {
    this.statuses.set(signature, this.confirmAs);
    return this.confirmAs;
  }
  async status(signature: string) {
    return this.statuses.get(signature) ?? "not_found";
  }
  async addressOf(userId: string) {
    return `addr-${userId}`;
  }
  async balanceOf(userId: string) {
    return this.prepared.filter((p) => p.userId === userId && this.sent.includes(p.signature)).reduce((s, p) => s + p.delta, 0);
  }
}

function enableChainEnv() {
  process.env.CHAIN_MINT_ADDRESS = "TestMint1111111111111111111111111111111111";
  process.env.CHAIN_AUTHORITY_SECRET = "test-authority";
  process.env.CHAIN_USER_SEED = "test-seed";
}

beforeEach(async () => {
  await Promise.all([t.cols.users.deleteMany({}), t.cols.ledger.deleteMany({}), t.cols.chain_outbox.deleteMany({})]);
  await t.cols.users.insertOne({ _id: USER, email: `${USER}@umass.edu`, name: "Chain", createdAt: new Date(), pointsBalance: 0, settings: { shareLocation: false } });
  bus.clear();
});

afterEach(() => CHAIN_VARS.forEach((v) => delete process.env[v]));

function grant(delta: number, key: string) {
  return { userId: USER, delta, ruleId: "test", reason: "Test", source: { type: "test", id: key }, idempotencyKey: `chain-test:${key}` };
}

describe("outbox", () => {
  it("one row per ledger entry, even when the event is replayed", async () => {
    enableChainEnv();
    const { entry } = await applyEntry(grant(40, "a"));
    const payload = { entryId: entry.id, userId: USER, delta: 40, ruleId: "test", balanceAfter: 40 };
    await emit("ledger.entry.created", payload);
    await emit("ledger.entry.created", payload);
    expect(await t.cols.chain_outbox.countDocuments({ ledgerEntryId: entry.id })).toBe(1);
  });

  it("with the Solana env vars unset, nothing is queued and the summary is inert", async () => {
    await applyEntry(grant(40, "b"));
    expect(await t.cols.chain_outbox.countDocuments()).toBe(0);
    expect(await getChainSummary(USER)).toEqual({ enabled: false, address: null, balance: 0, pendingCount: 0, explorerUrl: null });
  });

  it("a failing chain leaves the ledger and balance untouched and the row pending", async () => {
    enableChainEnv();
    await applyEntry(grant(40, "c"));
    const chain = new FakeChain();
    chain.failPrepare = true;
    const result = await drainOutbox(chain);
    expect(result).toMatchObject({ done: 0, failed: 0, deferred: 1 });
    const row = await t.cols.chain_outbox.findOne({ userId: USER });
    expect(row).toMatchObject({ status: "pending", attempts: 1, lastError: "devnet is down" });
    expect((await t.cols.users.findOne({ _id: USER }))?.pointsBalance).toBe(40);
    expect(await t.cols.ledger.countDocuments({ userId: USER })).toBe(1);
  });

  it("mints and burns in order and marks rows done with their signature", async () => {
    enableChainEnv();
    await applyEntry(grant(50, "d1"));
    await applyEntry(grant(-20, "d2"));
    const chain = new FakeChain();
    expect(await drainOutbox(chain)).toMatchObject({ done: 2 });
    expect(chain.prepared.map((p) => p.delta)).toEqual([50, -20]);
    expect(await t.cols.chain_outbox.countDocuments({ status: "done", signature: { $exists: true } })).toBe(2);
    expect(await drainOutbox(chain)).toMatchObject({ done: 0 }); // nothing re-sent
    expect(chain.sent).toHaveLength(2);
  });

  it("two drains at once never send the same row twice", async () => {
    enableChainEnv();
    await applyEntry(grant(10, "e1"));
    await applyEntry(grant(20, "e2"));
    const chain = new FakeChain();
    chain.delayMs = 50;
    await Promise.all([drainOutbox(chain), drainOutbox(chain), drainOutbox(chain)]);
    expect(chain.sent).toHaveLength(2);
    expect(chain.prepared.map((p) => p.delta).sort()).toEqual([10, 20]);
  });

  it("a user's later rows wait while an earlier one is unfinished", async () => {
    enableChainEnv();
    await applyEntry(grant(50, "f1"));
    await applyEntry(grant(-50, "f2"));
    const chain = new FakeChain();
    chain.confirmAs = "not_found";
    expect(await drainOutbox(chain)).toMatchObject({ done: 0, deferred: 2 });
    expect(chain.prepared).toHaveLength(1); // the burn was never attempted
  });

  it("after the lease, a saved signature that landed is marked done without re-sending", async () => {
    enableChainEnv();
    await applyEntry(grant(30, "g"));
    const chain = new FakeChain();
    chain.confirmAs = "not_found";
    await drainOutbox(chain);
    const [first] = chain.prepared;
    chain.statuses.set(first.signature, "confirmed"); // it landed late
    const later = () => new Date(Date.now() + OUTBOX.leaseMs + 1_000);
    expect(await drainOutbox(chain, { now: later })).toMatchObject({ done: 1 });
    expect(chain.prepared).toHaveLength(1);
  });

  it("gives up after the attempt cap and marks the row failed", async () => {
    enableChainEnv();
    await enqueue({ entryId: "entry-x", userId: USER, delta: 5 });
    const chain = new FakeChain();
    chain.failPrepare = true;
    let clock = Date.now();
    for (let i = 0; i < OUTBOX.maxAttempts; i++) {
      clock += OUTBOX.leaseMs + 1_000;
      await drainOutbox(chain, { now: () => new Date(clock) });
    }
    expect(await t.cols.chain_outbox.findOne({ ledgerEntryId: "entry-x" })).toMatchObject({ status: "failed", attempts: OUTBOX.maxAttempts });
  });

  it("the summary drains the user's rows and reports address, balance and explorer link", async () => {
    enableChainEnv();
    await applyEntry(grant(25, "h"));
    const summary = await getChainSummary(USER, new FakeChain());
    expect(summary).toEqual({
      enabled: true,
      address: `addr-${USER}`,
      balance: 25,
      pendingCount: 0,
      explorerUrl: `https://explorer.solana.com/address/addr-${USER}?cluster=devnet`,
    });
  });
});
