import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ERROR_STATUS, ErrorEnvelope } from "@/shared/contracts";
import { ApiError, errorResponse } from "./errors";
import { apiRoute } from "./handler";
import { parseBody, parseQuery, requireHeader } from "./parse";

const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, init);

describe("error envelope", () => {
  it("every code maps to the status in ERROR_STATUS and produces a valid envelope", async () => {
    for (const [code, status] of Object.entries(ERROR_STATUS)) {
      const res = errorResponse(code as keyof typeof ERROR_STATUS, "msg");
      expect(res.status).toBe(status);
      expect(ErrorEnvelope.parse(await res.json()).error).toEqual({ code, message: "msg" });
    }
  });

  it("ApiError has a readable default message", () => {
    expect(new ApiError("INSUFFICIENT_POINTS").message).toBe("Insufficient points");
  });
});

describe("apiRoute", () => {
  it("wraps a returned value as JSON with the configured status", async () => {
    const res = await apiRoute(() => ({ a: 1 }), { status: 201 })(req("/x") as never, undefined);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ a: 1 });
  });

  it("maps ApiError and zod errors to their envelopes", async () => {
    const forbidden = await apiRoute(() => {
      throw new ApiError("FORBIDDEN", "no");
    })(req("/x") as never, undefined);
    expect(forbidden.status).toBe(403);

    const bad = await apiRoute(async (r) => parseBody(r, z.strictObject({ n: z.number() })))(
      req("/x", { method: "POST", body: JSON.stringify({ n: "x" }) }) as never,
      undefined,
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("BAD_REQUEST");
  });

  it("hides the message of an unexpected error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await apiRoute(() => {
      throw new Error("secret connection string mongodb://user:pw@host");
    })(req("/x") as never, undefined);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("mongodb");
  });
});

describe("parsing helpers", () => {
  it("parseBody rejects bad JSON and unknown keys", async () => {
    const schema = z.strictObject({ a: z.string() });
    await expect(parseBody(req("/x", { method: "POST", body: "{nope" }), schema)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      parseBody(req("/x", { method: "POST", body: JSON.stringify({ a: "1", extra: 1 }) }), schema),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("parseQuery treats an empty value as absent, so coerce does not turn it into 0", () => {
    const schema = z.object({ lat: z.coerce.number().optional() });
    expect(parseQuery(req("/x?lat="), schema)).toEqual({});
    expect(parseQuery(req("/x?lat=42.5"), schema)).toEqual({ lat: 42.5 });
  });

  it("requireHeader trims and rejects a missing or oversized header", () => {
    expect(requireHeader(req("/x", { headers: { "Idempotency-Key": " abc " } }), "Idempotency-Key")).toBe("abc");
    expect(() => requireHeader(req("/x"), "Idempotency-Key")).toThrow(ApiError);
    expect(() => requireHeader(req("/x", { headers: { K: "x".repeat(300) } }), "K")).toThrow(ApiError);
  });
});
