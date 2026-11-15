import { beforeEach, describe, expect, it } from "vitest";
import { withTestDb } from "@/shared/db/testing";
import { bus } from "@/shared/events";
import { ApiError } from "@/shared/http";
import { getDensitySnapshot, getSharing, recordPing, setSharing } from "./index";
import { MAX_ACCURACY_M } from "./presence";

const t = withTestDb();

// Dubois library area; fx places sit near the campus centre, so use a real place's centre.
async function somePlace() {
  const { getPlaces } = await import("@/modules/campus");
  return (await getPlaces())[0];
}

async function addUser(id: string, shareLocation = false) {
  await t.cols.users.insertOne({
    _id: id,
    email: `${id}@umass.edu`,
    name: id,
    createdAt: new Date(),
    pointsBalance: 0,
    settings: { shareLocation },
  });
}

describe("presence and density (database)", () => {
  beforeEach(async () => {
    await t.cols.users.deleteMany({});
    await t.cols.presence.deleteMany({});
    process.env.SIMULATED_DENSITY = "0";
    process.env.DENSITY_MIN_LIVE_COUNT = "1";
  });

  it("refuses a ping with sharing off and stores nothing", async () => {
    await addUser("u1");
    await expect(recordPing("u1", { lat: 42.3868, lng: -72.5301 }, "web")).rejects.toMatchObject({ code: "SHARING_OFF" });
    expect(await t.cols.presence.countDocuments()).toBe(0);
  });

  it("keeps exactly one presence document per user, with a cell and place but no coordinates", async () => {
    await addUser("u1", true);
    const place = await somePlace();
    const seen: unknown[] = [];
    bus.on("presence.updated", "density-test:capture", (e) => void seen.push(e));
    const now = new Date("2026-11-17T15:00:00Z");
    await recordPing("u1", place.center, "web", now);
    await recordPing("u1", place.center, "web", new Date(now.getTime() + 60_000));

    const docs = await t.cols.presence.find().toArray();
    expect(docs).toHaveLength(1);
    expect(Object.keys(docs[0]).sort()).toEqual(["_id", "expiresAt", "h3", "placeId", "source", "updatedAt"]);
    expect(docs[0].placeId).toBe(place.id);
    expect(docs[0].expiresAt.getTime() - docs[0].updatedAt.getTime()).toBe(10 * 60_000);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ userId: "u1", placeId: place.id, position: place.center });
  });

  it("ignores a ping whose accuracy radius is too large, without failing or changing presence", async () => {
    await addUser("u1", true);
    const place = await somePlace();
    const seen: unknown[] = [];
    bus.on("presence.updated", "density-test:accuracy", (e) => void seen.push(e));
    const now = new Date("2026-11-17T15:00:00Z");

    // nothing stored yet: ignored, nothing created
    expect(await recordPing("u1", place.center, "web", now, MAX_ACCURACY_M + 1)).toEqual({ placeId: null, expiresAt: now });
    expect(await t.cols.presence.countDocuments()).toBe(0);

    // a good fix is stored; a later loose fix elsewhere leaves it exactly as it was
    const good = await recordPing("u1", place.center, "web", now, MAX_ACCURACY_M);
    const before = await t.cols.presence.findOne({ _id: "u1" });
    const later = new Date(now.getTime() + 60_000);
    const far = { lat: place.center.lat + 0.01, lng: place.center.lng };
    expect(await recordPing("u1", far, "web", later, 2_500)).toEqual(good);
    expect(await t.cols.presence.findOne({ _id: "u1" })).toEqual(before);
    expect(seen).toHaveLength(1);

    // sharing still has to be on
    await setSharing("u1", false);
    await expect(recordPing("u1", place.center, "web", later, 2_500)).rejects.toMatchObject({ code: "SHARING_OFF" });
  });

  it("deletes the presence document when sharing is turned off", async () => {
    await addUser("u1", true);
    await recordPing("u1", (await somePlace()).center, "web");
    expect(await t.cols.presence.countDocuments()).toBe(1);
    await setSharing("u1", false);
    expect(await t.cols.presence.countDocuments()).toBe(0);
    expect(await getSharing("u1")).toBe(false);
    await setSharing("u1", true);
    expect(await getSharing("u1")).toBe(true);
  });

  it("rejects sharing changes for an unknown user", async () => {
    await expect(setSharing("nobody", true)).rejects.toBeInstanceOf(ApiError);
  });

  it("counts live users for ten minutes, then they expire", async () => {
    await addUser("u1", true);
    const place = await somePlace();
    const start = new Date("2026-11-17T15:00:00Z");
    await recordPing("u1", place.center, "web", start);
    const row = (at: Date) => getDensitySnapshot(at).then((s) => s.places.find((p) => p.placeId === place.id));

    expect(await row(new Date(start.getTime() + 9 * 60_000))).toMatchObject({ live: 1, simulated: 0, count: 1 });
    expect(await row(new Date(start.getTime() + 11 * 60_000))).toBeUndefined();
  });

  it("drops live counts under DENSITY_MIN_LIVE_COUNT", async () => {
    const place = await somePlace();
    const now = new Date("2026-11-17T15:00:00Z");
    for (const id of ["u1", "u2"]) {
      await addUser(id, true);
      await recordPing(id, place.center, "web", now);
    }
    process.env.DENSITY_MIN_LIVE_COUNT = "3";
    expect((await getDensitySnapshot(now)).places).toHaveLength(0);
    process.env.DENSITY_MIN_LIVE_COUNT = "2";
    expect((await getDensitySnapshot(now)).places[0]).toMatchObject({ placeId: place.id, live: 2 });
  });

  it("labels simulated data and keeps it apart from live", async () => {
    process.env.SIMULATED_DENSITY = "1";
    const snap = await getDensitySnapshot(new Date("2026-11-17T15:05:00Z"));
    expect(snap.hasSimulated).toBe(true);
    expect(snap.places.length).toBeGreaterThan(0);
    expect(snap.places.every((p) => p.live === 0 && p.count === p.simulated)).toBe(true);
    expect(snap.points.every((p) => p.source === "simulated")).toBe(true);
    process.env.SIMULATED_DENSITY = "0";
    expect((await getDensitySnapshot(new Date("2026-11-17T15:05:00Z"))).hasSimulated).toBe(false);
  });
});

