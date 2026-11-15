import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ErrorEnvelope } from "@/shared/contracts";
import { withTestDb } from "@/shared/db/testing";
import { ApiError } from "@/shared/http";
import { CHAT_PER_MINUTE } from "@/modules/assistant";
import { POST } from "./route";

/** The per-user rate limit on POST /api/assistant/chat, against the real rate_limits collection. */

let userId = "rate-user-a";
vi.mock("@/modules/auth", () => ({
  requireUser: async () => {
    if (!userId) throw new ApiError("UNAUTHORIZED", "Sign in required");
    return { id: userId, email: `${userId}@umass.edu`, via: "session" };
  },
}));
// No network from tests: the model call fails at once and the keyword fallback answers.
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async () => {
        throw new Error("Gemini is not reachable from tests");
      },
    };
  },
}));

const t = withTestDb();
// Thirty seconds into a minute ten minutes ahead of the real clock. Rate-limit counters carry a
// TTL (expiresAt), so a pinned date in the past would let MongoDB's TTL sweep delete them mid-test.
const NOW = new Date(Math.ceil(Date.now() / 60_000) * 60_000 + 10 * 60_000 + 30_000);

const request = () =>
  POST(
    new NextRequest("http://localhost:3000/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", text: "hi" }] }),
    }),
    undefined,
  );

describe("POST /api/assistant/chat rate limit", () => {
  beforeEach(async () => {
    await t.cols.rate_limits.deleteMany({});
    // Freeze the clock (only Date) so the calls cannot straddle a minute boundary.
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    userId = "rate-user-a";
  });
  afterEach(() => vi.useRealTimers());

  it("answers 429 RATE_LIMITED after the per-minute allowance, per user, and again in the next minute", async () => {
    for (let i = 0; i < CHAT_PER_MINUTE; i++) expect((await request()).status).toBe(200);

    const limited = await request();
    expect(limited.status).toBe(429);
    expect(ErrorEnvelope.parse(await limited.json()).error.code).toBe("RATE_LIMITED");

    // another user is not affected
    userId = "rate-user-b";
    expect((await request()).status).toBe(200);

    // a new window starts the count again
    userId = "rate-user-a";
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    expect((await request()).status).toBe(200);
  });
});
