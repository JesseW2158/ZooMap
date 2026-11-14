import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventPayload, LatLng } from "@/shared/contracts";
import { withTestDb } from "@/shared/db/testing";
import { bus, emit } from "@/shared/events";
import { offsetM } from "@/shared/geo";
import { getPlaces } from "@/modules/campus";
import {
  createActivity,
  endActivityAsHost,
  getActiveParticipation,
  joinActivity,
  leaveActivity,
  listActiveActivities,
  settleStale,
} from "./index";

const t = withTestDb();

const user = (name: string) => ({ id: `seed-${name}`, email: `dev.${name}@umass.edu`, name: `${name} Dev` });
const alex = user("alex");
const blair = user("blair");
const casey = user("casey");

const T = new Date("2026-11-14T15:00:00Z");
const at = (s: number) => new Date(T.getTime() + s * 1000);
// Any real campus place: the tests depend on a place existing, not on which one.
let placeId: string;
const body = (title = "Study group", extra: Record<string, unknown> = {}) => ({
  title,
  placeId,
  category: "study" as const,
  ...extra,
});

let center: LatLng;
const near = () => offsetM(center, 50, 0);
const far = () => offsetM(center, 400, 0);

let ended: EventPayload<"participation.ended">[] = [];
let activityEnded: EventPayload<"activity.ended">[] = [];

beforeEach(async () => {
  await Promise.all([t.cols.activities.deleteMany({}), t.cols.participations.deleteMany({})]);
  const place = (await getPlaces())[0];
  placeId = place.id;
  center = place.center;
  ended = [];
  activityEnded = [];
  bus.on("participation.ended", "test:capture", (e) => void ended.push(e));
  bus.on("activity.ended", "test:capture", (e) => void activityEnded.push(e));
  delete process.env.GEOFENCE_ENFORCED;
});

afterEach(() => {
  bus.off("participation.ended", "test:capture");
  bus.off("activity.ended", "test:capture");
  delete process.env.GEOFENCE_ENFORCED;
});

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (error) {
    return (error as { code: string }).code;
  }
  return "OK";
}

const ping = (userId: string, s: number, position: LatLng, placeId: string | null = null) =>
  emit("presence.updated", { userId, position, placeId, at: at(s) });

async function verifiedSeconds(userId: string) {
  return (await t.cols.participations.findOne({ userId, status: "active" }))?.verifiedSeconds;
}

describe("hosting", () => {
  it("creates the activity and the host's participation", async () => {
    const a = await createActivity(alex, body(), T);
    expect(a).toMatchObject({ hostId: alex.id, hostName: "alex Dev", status: "active", participantCount: 1 });
    expect(a.placeCenter).toEqual(center);
    const me = await getActiveParticipation(alex.id, at(1));
    expect(me.participation).toMatchObject({ role: "host", activityId: a.id, verifiedSeconds: 0 });
  });

  it("a second concurrent host request gets 409 ALREADY_HOSTING", async () => {
    const results = await Promise.all([
      codeOf(createActivity(alex, body("one"), T)),
      codeOf(createActivity(alex, body("two"), T)),
    ]);
    expect(results.sort()).toEqual(["ALREADY_HOSTING", "OK"]);
    expect(await t.cols.activities.countDocuments({ hostId: alex.id, status: "active" })).toBe(1);
    expect(await t.cols.participations.countDocuments({ userId: alex.id, status: "active" })).toBe(1);
  });

  it("hosting while a guest elsewhere gets 409 ALREADY_IN_ACTIVITY and leaves nothing behind", async () => {
    const a = await createActivity(alex, body(), T);
    await joinActivity(blair, a.id, T);
    expect(await codeOf(createActivity(blair, body("mine"), T))).toBe("ALREADY_IN_ACTIVITY");
    expect(await t.cols.activities.countDocuments({ hostId: blair.id })).toBe(0);
  });

  it("rejects an unknown place and an end time in the past", async () => {
    expect(await codeOf(createActivity(alex, body("x", { placeId: "nowhere" }), T))).toBe("BAD_REQUEST");
    expect(await codeOf(createActivity(alex, body("x", { endsAt: at(-60).toISOString() }), T))).toBe("BAD_REQUEST");
  });
});

describe("joining", () => {
  it("joining while in another activity gets 409 ALREADY_IN_ACTIVITY", async () => {
    const a = await createActivity(alex, body(), T);
    const b = await createActivity(blair, body("other"), T);
    await joinActivity(casey, a.id, T);
    expect(await codeOf(joinActivity(casey, b.id, T))).toBe("ALREADY_IN_ACTIVITY");
    expect(await codeOf(joinActivity(alex, b.id, T))).toBe("ALREADY_IN_ACTIVITY"); // a host is in their own
  });

  it("enforces capacity even when two people join at once", async () => {
    const a = await createActivity(alex, body("pair", { capacity: 2 }), T);
    const results = await Promise.all([codeOf(joinActivity(blair, a.id, T)), codeOf(joinActivity(casey, a.id, T))]);
    expect(results.sort()).toEqual(["CAPACITY_FULL", "OK"]);
    expect(await t.cols.participations.countDocuments({ activityId: a.id, status: "active" })).toBe(2);
  });

  it("404 for an unknown activity, 409 ACTIVITY_ENDED for an ended one", async () => {
    expect(await codeOf(joinActivity(blair, "nope", T))).toBe("NOT_FOUND");
    const a = await createActivity(alex, body(), T);
    await endActivityAsHost(alex, a.id, at(10));
    expect(await codeOf(joinActivity(blair, a.id, at(20)))).toBe("ACTIVITY_ENDED");
  });

  it("lists active activities with participant counts", async () => {
    const a = await createActivity(alex, body(), T);
    await joinActivity(blair, a.id, T);
    const list = await listActiveActivities(at(1));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: a.id, participantCount: 2, placeName: expect.any(String) });
  });
});

describe("verified time", () => {
  it("adds gaps under 300 s between in-range pings, nothing for a longer gap, and resets on an out-of-range ping", async () => {
    const a = await createActivity(alex, body(), T);
    await joinActivity(blair, a.id, T);

    await ping(blair.id, 10, near()); // first in-range ping starts a run
    expect(await verifiedSeconds(blair.id)).toBe(0);
    await ping(blair.id, 70, near());
    expect(await verifiedSeconds(blair.id)).toBe(60);
    await ping(blair.id, 130, near());
    expect(await verifiedSeconds(blair.id)).toBe(120);

    await ping(blair.id, 530, near()); // gap of 400 s: earns nothing, restarts the run
    expect(await verifiedSeconds(blair.id)).toBe(120);
    await ping(blair.id, 560, near());
    expect(await verifiedSeconds(blair.id)).toBe(150);

    await ping(blair.id, 590, far()); // out of range: clears lastVerifiedAt
    expect(await verifiedSeconds(blair.id)).toBe(150);
    expect((await getActiveParticipation(blair.id, at(591))).participation?.verifying).toBe(false);
    await ping(blair.id, 620, near()); // back in range: a new run, the 30 s outside earn nothing
    expect(await verifiedSeconds(blair.id)).toBe(150);
    await ping(blair.id, 650, near());
    expect(await verifiedSeconds(blair.id)).toBe(180);

    const me = await getActiveParticipation(blair.id, at(651));
    expect(me.participation).toMatchObject({ verifiedSeconds: 180, verifying: true, pendingPoints: 3 });
  });

  it("an out-of-order (late) ping adds nothing and does not move the clock back", async () => {
    const a = await createActivity(alex, body(), T);
    await joinActivity(blair, a.id, T);
    await ping(blair.id, 100, near());
    await ping(blair.id, 40, near());
    await ping(blair.id, 160, near());
    expect(await verifiedSeconds(blair.id)).toBe(60);
  });

  it("a ping at the same place counts even far from the centre", async () => {
    const a = await createActivity(alex, body(), T);
    await joinActivity(blair, a.id, T);
    await ping(blair.id, 10, far(), placeId);
    await ping(blair.id, 40, far(), placeId);
    expect(await verifiedSeconds(blair.id)).toBe(30);
  });

  it("GEOFENCE_ENFORCED=0 counts pings anywhere", async () => {
    process.env.GEOFENCE_ENFORCED = "0";
    const a = await createActivity(alex, body(), T);
    await joinActivity(blair, a.id, T);
    await ping(blair.id, 10, far());
    await ping(blair.id, 40, far());
    expect(await verifiedSeconds(blair.id)).toBe(30);
  });

  it("pings from someone in no activity change nothing", async () => {
    await ping(casey.id, 10, near());
    expect(await t.cols.participations.countDocuments({})).toBe(0);
  });
});

describe("ending and settling", () => {
  it("leaving emits participation.ended once with the final verified time; leaving again is a no-op", async () => {
    const a = await createActivity(alex, body(), T);
    await joinActivity(blair, a.id, T);
    await ping(blair.id, 10, near());
    await ping(blair.id, 100, near());

    const left = await leaveActivity(blair, a.id, at(110));
    expect(left.participation).toMatchObject({ status: "ended", verifiedSeconds: 90, verifying: false });
    await leaveActivity(blair, a.id, at(120));
    expect(ended).toHaveLength(1);
    expect(ended[0]).toMatchObject({ userId: blair.id, role: "guest", verifiedSeconds: 90, endedAt: at(110) });

    await ping(blair.id, 130, near()); // after leaving: nothing changes
    expect((await t.cols.participations.findOne({ _id: left.participation.id }))?.verifiedSeconds).toBe(90);
  });

  it("participation.ended is emitted once when leave and settle race", async () => {
    const a = await createActivity(alex, body(), T);
    await joinActivity(blair, a.id, T);
    await ping(alex.id, 16 * 60, near()); // keep the host fresh
    const now = at(16 * 60); // the guest has had no verified ping for 16 minutes
    const results = await Promise.all([
      leaveActivity(blair, a.id, now),
      settleStale(now),
      settleStale(now),
      leaveActivity(blair, a.id, now),
    ]);
    expect(results[0].participation.status).toBe("ended");
    const guestEnds = ended.filter((e) => e.userId === blair.id);
    expect(guestEnds).toHaveLength(1);
  });

  it("a host who leaves ends the activity and every participation, each emitted once", async () => {
    const a = await createActivity(alex, body(), T);
    await joinActivity(blair, a.id, T);
    await joinActivity(casey, a.id, T);
    await Promise.all([leaveActivity(alex, a.id, at(60)), endActivityAsHost(alex, a.id, at(60)), settleStale(at(60))]);

    expect(ended.map((e) => e.userId).sort()).toEqual([alex.id, blair.id, casey.id]);
    expect(activityEnded).toHaveLength(1);
    expect(activityEnded[0]).toMatchObject({ activityId: a.id, participantCount: 3 });
    expect(await listActiveActivities(at(61))).toHaveLength(0);
    expect((await getActiveParticipation(blair.id, at(61))).participation).toBeNull();
  });

  it("only the host can end an activity", async () => {
    const a = await createActivity(alex, body(), T);
    await joinActivity(blair, a.id, T);
    expect(await codeOf(endActivityAsHost(blair, a.id, at(1)))).toBe("FORBIDDEN");
  });

  it("settles activities past endsAt", async () => {
    const a = await createActivity(alex, body("short", { endsAt: at(600).toISOString() }), T);
    await joinActivity(blair, a.id, T);
    expect(await listActiveActivities(at(599))).toHaveLength(1);
    expect(await listActiveActivities(at(600))).toHaveLength(0);
    expect(ended).toHaveLength(2);
  });

  it("ends an activity whose host has had no verified ping for 30 minutes", async () => {
    const a = await createActivity(alex, body(), T);
    await ping(alex.id, 60, near());
    await ping(alex.id, 120, far()); // out of range does not keep it alive
    expect(await listActiveActivities(at(60 + 30 * 60 - 1))).toHaveLength(1);
    expect(await listActiveActivities(at(60 + 30 * 60 + 1))).toHaveLength(0);
    expect(activityEnded[0]?.activityId).toBe(a.id);
  });

  it("ends a guest with no verified ping for 15 minutes, counted from joining when there was none", async () => {
    const a = await createActivity(alex, body(), T);
    await joinActivity(blair, a.id, T);
    await ping(alex.id, 14 * 60, near());
    await settleStale(at(15 * 60 - 1));
    expect(ended).toHaveLength(0);
    await settleStale(at(15 * 60 + 1));
    expect(ended.map((e) => e.userId)).toEqual([blair.id]);
  });

  it("ends participations left active in an activity that already ended", async () => {
    const a = await createActivity(alex, body(), T);
    await joinActivity(blair, a.id, T);
    await t.cols.activities.updateOne({ _id: a.id }, { $set: { status: "ended", endedAt: at(5) } });
    await settleStale(at(10));
    expect(ended.map((e) => e.userId).sort()).toEqual([alex.id, blair.id]);
  });
});
