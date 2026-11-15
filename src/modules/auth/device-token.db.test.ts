import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestDb } from "@/shared/db/testing";
import { createDeviceToken } from "@/modules/mobile";
import { revokeDeviceTokensOnSignOut } from "./events";
import { resolveDeviceToken } from "./device-token";
import { requireUser } from "./session";

// session.ts imports the Auth.js config; the cookie session is not under test here.
vi.mock("./config", () => ({ auth: async () => null }));

const t = withTestDb();

const alex = { _id: "seed-alex", email: "dev.alex@umass.edu", name: "Alex Dev" };
const blair = { _id: "seed-blair", email: "dev.blair@umass.edu", name: "Blair Dev" };

const request = (path: string, method: string, value: string | null) =>
  new Request(`http://localhost${path}`, { method, headers: value === null ? {} : { Authorization: value } });
/** A bearer request to the one route that accepts device tokens. */
const bearer = (value: string | null) => request("/api/presence/ping", "POST", value);
const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await Promise.all([t.cols.users.deleteMany({}), t.cols.device_tokens.deleteMany({})]);
  await t.cols.users.insertMany(
    [alex, blair].map((u) => ({ ...u, createdAt: new Date(), pointsBalance: 0, settings: { shareLocation: false } })),
  );
});

describe("device tokens", () => {
  it("a created token authenticates, as the device, and lastUsedAt advances", async () => {
    const { token } = await createDeviceToken(alex._id);

    const first = await resolveDeviceToken(bearer(`Bearer ${token}`));
    expect(first).toMatchObject({ id: alex._id, email: alex.email, name: alex.name, via: "device" });
    const row1 = await t.cols.device_tokens.findOne({ userId: alex._id });
    expect(row1?.lastUsedAt).toBeInstanceOf(Date);

    await new Promise((r) => setTimeout(r, 15));
    await resolveDeviceToken(bearer(`Bearer ${token}`));
    const row2 = await t.cols.device_tokens.findOne({ userId: alex._id });
    expect(row2!.lastUsedAt!.getTime()).toBeGreaterThan(row1!.lastUsedAt!.getTime());
  });

  it("accepts the scheme in any case and stray whitespace", async () => {
    const { token } = await createDeviceToken(alex._id);
    for (const header of [`bearer ${token}`, `BEARER   ${token}  `, `  Bearer ${token}`]) {
      expect((await resolveDeviceToken(bearer(header)))?.id, header).toBe(alex._id);
    }
  });

  it("stores only the SHA-256 of the token, and every token is different", async () => {
    const a = await createDeviceToken(alex._id);
    const b = await createDeviceToken(alex._id);
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url

    const rows = await t.cols.device_tokens.find({ userId: alex._id }).toArray();
    expect(rows).toHaveLength(2);
    const hashes = rows.map((r) => r.tokenHash).sort();
    expect(hashes).toEqual([a.token, b.token].map((x) => createHash("sha256").update(x).digest("hex")).sort());
    for (const row of rows) {
      expect(JSON.stringify(row)).not.toContain(a.token);
      expect(JSON.stringify(row)).not.toContain(b.token);
      expect(row.createdAt).toBeInstanceOf(Date);
    }
  });

  it("returns null for an unknown token", async () => {
    await createDeviceToken(alex._id);
    expect(await resolveDeviceToken(bearer("Bearer not-a-real-token"))).toBeNull();
  });

  it("returns null once the token row is deleted", async () => {
    const { token } = await createDeviceToken(alex._id);
    await t.cols.device_tokens.deleteMany({ userId: alex._id });
    expect(await resolveDeviceToken(bearer(`Bearer ${token}`))).toBeNull();
  });

  it("returns null for a token whose user is gone or no longer allowed", async () => {
    const { token } = await createDeviceToken(alex._id);
    await t.cols.users.updateOne({ _id: alex._id }, { $set: { email: "alex@example.com" } });
    expect(await resolveDeviceToken(bearer(`Bearer ${token}`))).toBeNull();
    await t.cols.users.deleteOne({ _id: alex._id });
    expect(await resolveDeviceToken(bearer(`Bearer ${token}`))).toBeNull();
  });

  it("returns null, never throws, for a missing or malformed header", async () => {
    const { token } = await createDeviceToken(alex._id);
    for (const header of [null, "", "Bearer", "Bearer ", `Basic ${token}`, token, `Bearer ${token} extra`, `Bearer: ${token}`]) {
      expect(await resolveDeviceToken(bearer(header)), String(header)).toBeNull();
    }
  });

  it("requireUser accepts the device token on POST /api/presence/ping and answers 401 for an unknown one", async () => {
    const { token } = await createDeviceToken(blair._id);
    await expect(requireUser(bearer(`Bearer ${token}`))).resolves.toMatchObject({ id: blair._id, via: "device" });
    await expect(requireUser(bearer("Bearer unknown"))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(requireUser(bearer(null))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("requireUser refuses a valid device token anywhere but POST /api/presence/ping", async () => {
    const { token } = await createDeviceToken(blair._id);
    const header = `Bearer ${token}`;
    const refused: [string, string][] = [
      ["/api/store/redeem", "POST"],
      ["/api/activities", "POST"],
      ["/api/activities", "GET"],
      ["/api/mobile/device-token", "POST"],
      ["/api/presence/ping", "GET"],
      ["/api/presence/ping", "PUT"],
      ["/api/presence/sharing", "PUT"],
      ["/api/presence/ping/extra", "POST"],
      ["/api/presence/ping-other", "POST"],
    ];
    for (const [path, method] of refused) {
      await expect(requireUser(request(path, method, header)), `${method} ${path}`).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    // a query string does not change the path
    await expect(requireUser(request("/api/presence/ping?x=1", "POST", header))).resolves.toMatchObject({ via: "device" });
    // the token itself is still good
    expect((await resolveDeviceToken(bearer(header)))?.id).toBe(blair._id);
  });

  it("a token idle for 31 days is refused and its row deleted; one idle 29 days works and lastUsedAt advances", async () => {
    const stale = await createDeviceToken(alex._id);
    const fresh = await createDeviceToken(blair._id);
    const now = Date.now();
    await t.cols.device_tokens.updateOne({ userId: alex._id }, { $set: { lastUsedAt: new Date(now - 31 * DAY) } });
    const old = new Date(now - 29 * DAY);
    await t.cols.device_tokens.updateOne({ userId: blair._id }, { $set: { lastUsedAt: old } });

    expect(await resolveDeviceToken(bearer(`Bearer ${stale.token}`))).toBeNull();
    expect(await t.cols.device_tokens.countDocuments({ userId: alex._id })).toBe(0);
    expect(await resolveDeviceToken(bearer(`Bearer ${stale.token}`))).toBeNull();

    expect((await resolveDeviceToken(bearer(`Bearer ${fresh.token}`)))?.id).toBe(blair._id);
    const row = await t.cols.device_tokens.findOne({ userId: blair._id });
    expect(row!.lastUsedAt!.getTime()).toBeGreaterThan(old.getTime() + DAY);
  });

  it("a token never used counts from its creation date", async () => {
    const { token } = await createDeviceToken(alex._id);
    await t.cols.device_tokens.updateOne({ userId: alex._id }, { $set: { createdAt: new Date(Date.now() - 31 * DAY) } });
    expect(await resolveDeviceToken(bearer(`Bearer ${token}`))).toBeNull();
    expect(await t.cols.device_tokens.countDocuments({ userId: alex._id })).toBe(0);
  });
});

describe("signOut event", () => {
  it("deletes the signing-out user's device tokens and nobody else's", async () => {
    const mine = await createDeviceToken(alex._id);
    await createDeviceToken(alex._id);
    const theirs = await createDeviceToken(blair._id);

    await revokeDeviceTokensOnSignOut({ token: { uid: alex._id } });

    expect(await t.cols.device_tokens.countDocuments({ userId: alex._id })).toBe(0);
    expect(await resolveDeviceToken(bearer(`Bearer ${mine.token}`))).toBeNull();
    expect((await resolveDeviceToken(bearer(`Bearer ${theirs.token}`)))?.id).toBe(blair._id);
  });

  it("does nothing without a user id in the token", async () => {
    await createDeviceToken(alex._id);
    await revokeDeviceTokensOnSignOut({ token: null });
    await revokeDeviceTokensOnSignOut({ token: {} });
    await revokeDeviceTokensOnSignOut({ session: {} });
    expect(await t.cols.device_tokens.countDocuments({})).toBe(1);
  });
});
