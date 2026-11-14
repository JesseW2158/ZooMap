import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { withTestDb } from "@/shared/db/testing";
import { HANDOFF_TTL_MS, challengeFor, consumeHandoffCode, createHandoffCode, isValidChallenge, isValidVerifier } from "./handoff";

const t = withTestDb();

const alex = { _id: "seed-alex", email: "dev.alex@umass.edu", name: "Alex Dev" };
const VERIFIER = "v".repeat(43);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

beforeEach(async () => {
  await Promise.all([t.cols.users.deleteMany({}), t.cols.handoff_codes.deleteMany({})]);
  await t.cols.users.insertOne({ ...alex, createdAt: new Date(), pointsBalance: 0, settings: { shareLocation: false } });
});

describe("handoff codes", () => {
  it("challenge is base64url SHA-256, 43 characters", () => {
    expect(challengeFor(VERIFIER)).toBe(CHALLENGE);
    expect(CHALLENGE).toHaveLength(43);
    expect(isValidChallenge(CHALLENGE)).toBe(true);
    for (const bad of ["", "short", `${CHALLENGE}=`, `${CHALLENGE}a`, CHALLENGE.slice(1), `${CHALLENGE.slice(1)}+`, 42, null]) {
      expect(isValidChallenge(bad), String(bad)).toBe(false);
    }
    expect(isValidVerifier(VERIFIER)).toBe(true);
    expect(isValidVerifier("tooshort")).toBe(false);
  });

  it("a valid code and verifier give the user", async () => {
    const code = await createHandoffCode(alex._id, CHALLENGE);
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await consumeHandoffCode(code, VERIFIER)).toEqual({ id: alex._id, email: alex.email, name: alex.name });
  });

  it("stores only a hash of the code, bound to the challenge, expiring in 60 seconds", async () => {
    const now = new Date("2026-11-14T15:00:00Z");
    const code = await createHandoffCode(alex._id, CHALLENGE, now);
    const rows = await t.cols.handoff_codes.find({}).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).not.toBe(code);
    expect(rows[0]._id).toBe(createHash("sha256").update(code).digest("base64url"));
    expect(JSON.stringify(rows[0])).not.toContain(code);
    expect(rows[0]).toMatchObject({ userId: alex._id, challenge: CHALLENGE });
    expect(rows[0].expiresAt.getTime() - now.getTime()).toBe(HANDOFF_TTL_MS);
    expect(HANDOFF_TTL_MS).toBe(60_000);
  });

  it("a code works once", async () => {
    const code = await createHandoffCode(alex._id, CHALLENGE);
    expect(await consumeHandoffCode(code, VERIFIER)).not.toBeNull();
    expect(await consumeHandoffCode(code, VERIFIER)).toBeNull();
    expect(await t.cols.handoff_codes.countDocuments({})).toBe(0);
  });

  it("several simultaneous uses of one code: exactly one wins", async () => {
    const code = await createHandoffCode(alex._id, CHALLENGE);
    const results = await Promise.all(Array.from({ length: 5 }, () => consumeHandoffCode(code, VERIFIER)));
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });

  it("an expired code gives nobody", async () => {
    const issued = new Date(Date.now() - HANDOFF_TTL_MS - 1000);
    const code = await createHandoffCode(alex._id, CHALLENGE, issued);
    expect(await consumeHandoffCode(code, VERIFIER)).toBeNull();
  });

  it("a wrong verifier gives nobody, and the code is spent anyway", async () => {
    const code = await createHandoffCode(alex._id, CHALLENGE);
    expect(await consumeHandoffCode(code, "w".repeat(43))).toBeNull();
    expect(await t.cols.handoff_codes.countDocuments({})).toBe(0);
    expect(await consumeHandoffCode(code, VERIFIER)).toBeNull(); // the right verifier is too late
  });

  it("an unknown, malformed or missing code or verifier gives nobody", async () => {
    const code = await createHandoffCode(alex._id, CHALLENGE);
    const cases: [unknown, unknown][] = [
      ["x".repeat(43), VERIFIER],
      ["", VERIFIER],
      [undefined, VERIFIER],
      [code, undefined],
      [code, ""],
      [code, "short"],
      [{ $ne: null }, VERIFIER],
      [code, { $ne: null }],
    ];
    for (const [c, v] of cases) expect(await consumeHandoffCode(c, v), `${String(c)}/${String(v)}`).toBeNull();
    // none of those touched the real code
    expect(await consumeHandoffCode(code, VERIFIER)).not.toBeNull();
  });

  it("never creates a user: a code for a missing user gives nobody", async () => {
    const code = await createHandoffCode("ghost", CHALLENGE);
    expect(await consumeHandoffCode(code, VERIFIER)).toBeNull();
    expect(await t.cols.users.countDocuments({ _id: "ghost" })).toBe(0);
  });

  it("refuses to make a code for a bad challenge", async () => {
    await expect(createHandoffCode(alex._id, "nope")).rejects.toThrow();
  });
});
