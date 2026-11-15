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

// Route handlers that own a database are swapped for their module's fixtures here; their own
// `*.db.test.ts` files cover the real behaviour. Same signatures, so the contract still holds.
vi.mock("@/modules/activities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/activities")>();
  const f = actual.fixtures;
  return {
    ...actual,
    listActiveActivities: async () => f.activitiesFixture(new Date()),
    getActiveParticipation: async () => f.noParticipationFixture,
    createActivity: async (user: AuthUser, body: Parameters<typeof f.createdActivityFixture>[0]) =>
      f.createdActivityFixture(body, { id: user.id, name: user.name ?? user.email }, new Date()),
    joinActivity: async (user: AuthUser, id: string) => f.participationResultFixture(id, user.id, new Date()),
    leaveActivity: async (user: AuthUser, id: string) => f.leftResultFixture(id, user.id, new Date()),
    endActivityAsHost: async (user: AuthUser, id: string) => f.endedActivityFixture(id, user.id, new Date()),
  };
});

vi.mock("@/modules/density", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/density")>();
  const { getPlaces } = await import("@/modules/campus");
  return {
    ...actual,
    getDensitySnapshot: async () => actual.fixtures.densitySnapshotFixture(await getPlaces(), new Date()),
    getSharing: async () => false,
    setSharing: async (_userId: string, enabled: boolean) => enabled,
    recordPing: async () => ({ placeId: null, expiresAt: new Date(Date.now() + 10 * 60_000) }),
  };
});

vi.mock("@/modules/friends", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/friends")>();
  const f = actual.fixtures;
  return {
    ...actual,
    getMyProfile: async (user: AuthUser) => f.profileFixture(user.id, user.name ?? user.email),
    updateProfile: async (user: AuthUser) => f.profileFixture(user.id, user.name ?? user.email),
    getProfile: async (_viewerId: string, id: string) => f.profileFixture(id, "Blair Dev"),
    listFriends: async () => [f.friendFixture()],
    addFriend: async () => f.friendFixture(),
    removeFriend: async () => ({ ok: true as const }),
    issueFriendCode: async () => f.friendCodeFixture(),
    previewFriendCode: async () => f.previewFixture(),
    listInvites: async () => [f.inviteFixture()],
    sendInvites: async (_user: AuthUser, body: { toUserIds: string[] }) => f.inviteResultFixture(body.toUserIds),
    acceptInvite: async (user: AuthUser) => {
      const { fixtures } = await import("@/modules/activities");
      return fixtures.participationResultFixture("fixture-activity-1", user.id, new Date());
    },
    declineInvite: async () => ({ ok: true as const }),
    listConversations: async () => [f.conversationFixture()],
    countUnread: async () => ({ count: 1 }),
    listMessages: async (userId: string, friendId: string) => [f.messageFixture(friendId, userId)],
    sendMessage: async (userId: string, friendId: string, body: string) => ({ ...f.messageFixture(userId, friendId), body }),
    markConversationRead: async () => ({ ok: true as const }),
  };
});

// The real `createDeviceToken` writes to the database; `src/modules/auth/device-token.db.test.ts` covers it.
vi.mock("@/modules/mobile", () => ({ createDeviceToken: async () => ({ token: "FIXTURE-DEVICE-TOKEN" }) }));

vi.mock("@/modules/schedule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/schedule")>();
  const f = actual.fixtures;
  return {
    ...actual,
    getUpcomingEvents: async (_userId: string, range: { from: Date }) => f.eventsFixture(range.from),
    listConnections: async () => f.connectionsFixture,
    createConnection: async (_userId: string, body: { provider: "ics" | "manual" | "plan"; label: string }) => f.createdConnectionFixture(body),
    deleteConnection: async () => undefined,
    updateConnection: async (_userId: string, body: { id: string }) => ({ ...f.connectionsFixture[0], id: body.id }),
  };
});

// Rewards routes are backed by the database. This test checks wiring and contract shape only,
// so the module's data functions return its fixtures; src/modules/rewards/rewards.db.test.ts
// covers real behaviour. (Other database-backed modules can follow the same pattern.)
vi.mock("@/modules/rewards", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/modules/rewards")>();
  return {
    ...real,
    getRewardsMe: async () => real.fixtures.rewardsMeFixture(120, new Date()),
    listStoreItems: async () => real.fixtures.storeItemsFixture,
    redeem: async (_userId: string, itemId: string) => ({
      redemption: real.fixtures.redemptionFixture(itemId, new Date()),
      created: true,
    }),
  };
});

// The chain summary reaches Solana devnet when its env vars are set; keep this test offline.
vi.mock("@/modules/chain", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/modules/chain")>();
  return {
    ...real,
    getChainSummary: async () => ({ enabled: false, address: null, balance: 0, pendingCount: 0, explorerUrl: null }),
  };
});

// Notifications read the schedule, activities and density; this test checks shape only.
// src/modules/notifications/notifications.db.test.ts covers real behaviour.
vi.mock("@/modules/notifications", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/modules/notifications")>();
  return {
    ...real,
    getNotifications: async () => real.fixtures.notificationsFixture(new Date()),
    markAlertsRead: async () => undefined,
    updateAlertSettings: async (_userId: string, body: object) => ({ ...real.DEFAULT_SETTINGS, ...body }),
  };
});

vi.mock("@/modules/planned", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/modules/planned")>();
  const f = real.fixtures;
  return {
    ...real,
    listPlannedEvents: async () => [f.plannedEventFixture(new Date())],
    createPlannedEvent: async (user: AuthUser, body: Parameters<typeof f.createdPlannedEventFixture>[0]) =>
      f.createdPlannedEventFixture(body, { id: user.id, name: user.name ?? user.email }, new Date()),
    setGoing: async (_user: AuthUser, id: string, going: boolean) => f.plannedEventFixture(new Date(), { id, going }),
    cancelPlannedEvent: async () => undefined,
  };
});

const loaders = import.meta.glob<Record<string, (req: NextRequest, ctx?: unknown) => Promise<Response>>>("./**/route.ts");

/** A valid request for each route. Keyed like `API_ROUTES`. */
const SAMPLES: Record<string, { query?: string; body?: unknown; headers?: Record<string, string> }> = {
  placesSearch: { query: "?q=du" },
  route: { query: "?to=r4054634&fromPlaceId=w292876549" },
  presencePing: { body: { lat: 42.3868, lng: -72.5301 } },
  presenceSharingSet: { body: { enabled: true } },
  activitiesCreate: { body: { title: "Study group", placeId: "w292876549", category: "study" } },
  storeRedeem: { body: { itemId: "fixture-item-1" }, headers: { "Idempotency-Key": "test-key-1" } },
  scheduleConnectionsCreate: {
    body: { provider: "ics", label: "Canvas", url: "https://canvas.instructure.com/feeds/calendars/user_x.ics" },
  },
  scheduleConnectionsDelete: { query: "?id=fixture-connection-1" },
  scheduleConnectionsUpdate: { body: { id: "fixture-connection-1", skip: { eventId: "fixture-event-1", skipped: true } } },
  recommend: { body: { origin: { placeId: "w292876549" }, prefs: {} } },
  assistantChat: { body: { messages: [{ role: "user", text: "hi" }] } },
  profileUpdate: { body: { pronouns: "they/them" } },
  friendsAdd: { body: { code: "ABCDEFGHJKLMNPQRSTUV" } },
  friendPreview: { query: "?code=ABCDEFGHJKLMNPQRSTUV" },
  invitesSend: { body: { activityId: "act-1", toUserIds: ["seed-blair"] } },
  inviteAccept: { body: {} },
  messagesSend: { body: { body: "Meet at the library?" } },
  notificationsRead: { body: { all: true } },
  notificationsSettings: { body: { quietRooms: true, nearbyRadiusM: 400 } },
  plannedEventsCreate: {
    body: { title: "Spring Concert", placeId: "w292876549", category: "social", startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), capacity: 400 },
  },
  plannedEventGoing: { body: { going: true } },
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
