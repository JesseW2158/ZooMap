/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { API_ROUTES, ErrorEnvelope, type ApiRouteSpec } from "@/shared/contracts";
import { ApiError } from "@/shared/http";
import type { AuthUser } from "@/shared/contracts";

/**
 * Walks `API_ROUTES`: every route file exists, answers 401 signed out, and signed in returns
 * a body that passes its response schema. It fails when a stub drifts from the contract and
 * when someone adds a route to the table without a file. Streams extend the real handlers;
 * this test keeps passing as long as they honour the contract.
 */

let current: AuthUser | null = null;
const USER: AuthUser = { id: "seed-alex", email: "dev.alex@umass.edu", name: "Alex Dev", via: "session" };

vi.mock("@/modules/auth", () => ({
  requireUser: async () => {
    if (!current) throw new ApiError("UNAUTHORIZED", "Sign in required");
    return current;
  },
  getAuthUser: async () => current,
  getSessionUser: async () => current,
  // the Auth.js route exports these; they are not exercised here
  handlers: { GET: () => new Response(null), POST: () => new Response(null) },
  auth: async () => null,
  signIn: async () => undefined,
  signOut: async () => undefined,
  resolveDeviceToken: async () => null,
  seedUsers: () => [],
}));

const loaders = import.meta.glob<Record<string, (req: NextRequest, ctx?: unknown) => Promise<Response>>>("./**/route.ts");

/** A valid request for each route. Keyed like `API_ROUTES`. */
const SAMPLES: Record<string, { query?: string; body?: unknown; headers?: Record<string, string> }> = {
  placesSearch: { query: "?q=du" },
  route: { query: "?to=fx-dubois&fromPlaceId=fx-ilc" },
  presencePing: { body: { lat: 42.3868, lng: -72.5301 } },
  presenceSharingSet: { body: { enabled: true } },
  activitiesCreate: { body: { title: "Study group", placeId: "fx-ilc", category: "study" } },
  storeRedeem: { body: { itemId: "fixture-item-1" }, headers: { "Idempotency-Key": "test-key-1" } },
  scheduleConnectionsCreate: {
    body: { provider: "ics", label: "Canvas", url: "https://canvas.instructure.com/feeds/calendars/user_x.ics" },
  },
  scheduleConnectionsDelete: { query: "?id=fixture-connection-1" },
  recommend: { body: { origin: { placeId: "fx-ilc" }, prefs: {} } },
};

function routeFile(path: string): string {
  return `.${path.replace(/^\/api/, "")}/route.ts`;
}

function buildRequest(spec: ApiRouteSpec, name: string): NextRequest {
  const sample = SAMPLES[name] ?? {};
  const url = `http://localhost:3000${spec.path.replace("[id]", "act-1")}${sample.query ?? ""}`;
  return new NextRequest(url, {
    method: spec.method,
    headers: { ...(sample.body !== undefined ? { "Content-Type": "application/json" } : {}), ...sample.headers },
    body: sample.body !== undefined ? JSON.stringify(sample.body) : undefined,
  });
}

const entries = Object.entries(API_ROUTES) as [string, ApiRouteSpec][];

describe("API route contract", () => {
  beforeEach(() => {
    current = null;
  });

  it("has a route file for every entry in API_ROUTES", () => {
    for (const [name, spec] of entries) {
      expect(loaders[routeFile(spec.path)], `${name}: ${spec.path} has no route.ts`).toBeTypeOf("function");
    }
  });

  describe.each(entries)("%s", (name, spec) => {
    const params = { params: Promise.resolve({ id: "act-1" }) };

    async function call(): Promise<Response> {
      const mod = await loaders[routeFile(spec.path)]();
      const handler = mod[spec.method];
      expect(handler, `${spec.method} ${spec.path} is not exported`).toBeTypeOf("function");
      return handler(buildRequest(spec, name), params);
    }

    it("returns 401 when signed out", async () => {
      const res = await call();
      expect(res.status).toBe(401);
      expect(ErrorEnvelope.parse(await res.json()).error.code).toBe("UNAUTHORIZED");
    });

    it(`returns ${spec.status} with a body that matches its schema when signed in`, async () => {
      current = USER;
      const res = await call();
      const text = await res.text();
      expect(res.status, text).toBe(spec.status);
      const result = spec.response.safeParse(JSON.parse(text));
      expect(result.success, result.success ? "" : JSON.stringify(result.error.issues)).toBe(true);
    });

    if (spec.body) {
      it("rejects a body that is not valid JSON for its schema with 400", async () => {
        current = USER;
        const mod = await loaders[routeFile(spec.path)]();
        const req = new NextRequest(`http://localhost:3000${spec.path.replace("[id]", "act-1")}`, {
          method: spec.method,
          headers: { "Content-Type": "application/json", ...SAMPLES[name]?.headers },
          body: JSON.stringify({ definitelyNotAField: true }),
        });
        const res = await mod[spec.method](req, params);
        expect(res.status).toBe(400);
        expect(ErrorEnvelope.parse(await res.json()).error.code).toBe("BAD_REQUEST");
      });
    }
  });

  it("store/redeem requires an Idempotency-Key header", async () => {
    current = USER;
    const mod = await loaders["./store/redeem/route.ts"]();
    const res = await mod.POST(
      new NextRequest("http://localhost:3000/api/store/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: "fixture-item-1" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("device tokens are issued to a session only, never to a device token", async () => {
    current = { ...USER, via: "device" };
    const mod = await loaders["./mobile/device-token/route.ts"]();
    const res = await mod.POST(new NextRequest("http://localhost:3000/api/mobile/device-token", { method: "POST" }));
    expect(res.status).toBe(403);
  });

  it("the Google calendar OAuth stubs redirect when signed in and 401 when not", async () => {
    for (const path of ["connect", "callback"]) {
      const mod = await loaders[`./schedule/google/${path}/route.ts`]();
      const req = () => new NextRequest(`http://localhost:3000/api/schedule/google/${path}`);
      current = null;
      expect((await mod.GET(req())).status).toBe(401);
      current = USER;
      expect((await mod.GET(req())).status).toBe(302);
    }
  });
});
