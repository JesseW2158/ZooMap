import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestDb } from "@/shared/db/testing";

let current: { id: string; email: string } | null = null;

// The real module pulls in Auth.js; only the session lookup is replaced.
vi.mock("@/modules/auth", async () => {
  const handoff = await import("../../../../modules/auth/handoff");
  return {
    createHandoffCode: handoff.createHandoffCode,
    isValidChallenge: handoff.isValidChallenge,
    getSessionUser: async () => current,
  };
});

import { GET, POST } from "./route";

const t = withTestDb();

const CHALLENGE = "A".repeat(43);
const URL_ = `http://localhost:3000/auth/mobile/done?challenge=${CHALLENGE}`;
const SAME = { "Sec-Fetch-Site": "same-origin", Origin: "http://localhost:3000", Host: "localhost:3000" };

beforeEach(async () => {
  current = { id: "seed-alex", email: "dev.alex@umass.edu" };
  await t.cols.handoff_codes.deleteMany({});
});

describe("/auth/mobile/done", () => {
  it("GET asks for confirmation and never creates a code", async () => {
    const res = await GET(new Request(URL_));
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body).toContain("dev.alex@umass.edu");
    expect(body).toContain('method="post"');
    expect(body).not.toContain("zoomap://");
    expect(await t.cols.handoff_codes.countDocuments({})).toBe(0);
  });

  it("GET signed out goes to start, with no code; a bad challenge is a 400", async () => {
    current = null;
    const res = await GET(new Request(URL_));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain(`/auth/mobile/start?challenge=${CHALLENGE}`);
    expect((await GET(new Request("http://localhost:3000/auth/mobile/done?challenge=x"))).status).toBe(400);
    expect(await t.cols.handoff_codes.countDocuments({})).toBe(0);
  });

  it("POST creates one code bound to the challenge and answers with the zoomap:// page", async () => {
    const res = await POST(new Request(URL_, { method: "POST", headers: SAME }));
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatch(/location\.replace\("zoomap:\/\/auth\?code=[A-Za-z0-9_-]{43}"\)/);
    expect(body).toContain("Return to MinuteMap");
    const rows = await t.cols.handoff_codes.find({}).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: "seed-alex", challenge: CHALLENGE });
  });

  it("POST works with only an Origin header, and refuses a cross-site one", async () => {
    const ok = await POST(new Request(URL_, { method: "POST", headers: { Origin: "http://localhost:3000", Host: "localhost:3000" } }));
    expect(ok.status).toBe(200);
    await t.cols.handoff_codes.deleteMany({});

    const refused: Record<string, string>[] = [
      {},
      { "Sec-Fetch-Site": "cross-site", Origin: "http://localhost:3000", Host: "localhost:3000" },
      { "Sec-Fetch-Site": "same-site" },
      { Origin: "https://evil.example", Host: "localhost:3000" },
      { Origin: "null", Host: "localhost:3000" },
    ];
    for (const headers of refused) {
      const res = await POST(new Request(URL_, { method: "POST", headers }));
      expect(res.status, JSON.stringify(headers)).toBe(403);
    }
    expect(await t.cols.handoff_codes.countDocuments({})).toBe(0);
  });

  it("POST signed out creates nothing", async () => {
    current = null;
    const res = await POST(new Request(URL_, { method: "POST", headers: SAME }));
    expect(res.status).toBe(303);
    expect(await t.cols.handoff_codes.countDocuments({})).toBe(0);
  });
});
