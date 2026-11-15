import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventPayload } from "@/shared/contracts";
import { withTestDb } from "@/shared/db/testing";
import { bus } from "@/shared/events";
import { getPlaces } from "@/modules/campus";
import { createActivity, endActivityAsHost, getActiveParticipation, joinActivity } from "@/modules/activities";
import {
  acceptInvite,
  addFriend,
  declineInvite,
  getMyProfile,
  getProfile,
  issueFriendCode,
  listFriends,
  listInvites,
  previewFriendCode,
  removeFriend,
  sendInvites,
  updateProfile,
} from "./index";

const t = withTestDb();

const user = (slug: string) => ({ id: `seed-${slug}`, email: `dev.${slug}@umass.edu`, name: `${slug[0].toUpperCase()}${slug.slice(1)} Dev` });
const alex = user("alex");
const blair = user("blair");
const casey = user("casey");
const drew = user("drew");
const ORIGIN = "http://localhost:3000";

let placeId: string;
let created: EventPayload<"friendship.created">[] = [];

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (error) {
    return (error as { code: string }).code;
  }
  return "OK";
}

/** Make two users friends through a real code, as the app does. */
async function befriend(a: typeof alex, b: typeof alex) {
  const { code } = await issueFriendCode(a, ORIGIN);
  return addFriend(b, code);
}

beforeEach(async () => {
  await Promise.all(
    (["users", "profiles", "friendships", "activity_invites", "rate_limits", "activities", "participations"] as const).map((c) =>
      t.cols[c].deleteMany({}),
    ),
  );
  await t.cols.users.insertMany(
    [alex, blair, casey, drew].map((u) => ({
      _id: u.id,
      email: u.email,
      name: u.name,
      createdAt: new Date(),
      pointsBalance: 0,
      settings: { shareLocation: false },
    })),
  );
  placeId = (await getPlaces())[0].id;
  created = [];
  bus.on("friendship.created", "test:capture", (e) => void created.push(e));
});

afterEach(() => bus.off("friendship.created", "test:capture"));

describe("profiles", () => {
  it("saves, normalises and clears fields", async () => {
    const saved = await updateProfile(alex, {
      pronouns: "they/them",
      phone: "(413) 555-0100",
      contactEmail: "Alex@Example.com",
      socials: [{ kind: "instagram", handle: "@alexdev" }],
    });
    expect(saved).toMatchObject({ name: "Alex Dev", pronouns: "they/them", phone: "+14135550100", email: "alex@example.com" });
    expect(saved.socials).toEqual([{ kind: "instagram", handle: "alexdev", url: "https://www.instagram.com/alexdev" }]);

    const cleared = await updateProfile(alex, { phone: null, pronouns: "" });
    expect(cleared).toMatchObject({ phone: null, pronouns: null, email: "alex@example.com" });
    expect(await codeOf(updateProfile(alex, { phone: "12" }))).toBe("BAD_REQUEST");
  });

  it("a stranger, a guessed id and an unfriended user all get 404; a friend sees everything", async () => {
    await updateProfile(alex, { phone: "4135550100" });
    expect(await codeOf(getProfile(blair.id, alex.id))).toBe("NOT_FOUND");
    expect(await codeOf(getProfile(blair.id, "seed-nobody"))).toBe("NOT_FOUND");

    await befriend(alex, blair);
    expect((await getProfile(blair.id, alex.id)).phone).toBe("+14135550100");
    expect(await codeOf(getProfile(casey.id, alex.id))).toBe("NOT_FOUND");

    await removeFriend(blair.id, alex.id);
    expect(await codeOf(getProfile(blair.id, alex.id))).toBe("NOT_FOUND");
    expect((await getMyProfile(alex)).phone).toBe("+14135550100");
  });
});

describe("friend codes", () => {
  it("a preview shows only the public part", async () => {
    await updateProfile(alex, { pronouns: "he/him", phone: "4135550100" });
    const { code } = await issueFriendCode(alex, ORIGIN);
    const preview = await previewFriendCode(blair, code);
    expect(preview).toEqual({ userId: alex.id, name: "Alex Dev", image: null, pronouns: "he/him", alreadyFriends: false, self: false });
    expect(preview).not.toHaveProperty("phone");
  });

  it("the QR link points at /add/<code> on the given site", async () => {
    const { code, url } = await issueFriendCode(alex, ORIGIN);
    expect(url).toBe(`${ORIGIN}/add/${code.replaceAll("-", "")}`);
  });

  it("ten concurrent adds with the same code make one friendship and one event", async () => {
    const { code } = await issueFriendCode(alex, ORIGIN);
    const results = await Promise.all(Array.from({ length: 10 }, () => addFriend(blair, code)));
    expect(new Set(results.map((r) => r.since)).size).toBe(1);
    expect(await t.cols.friendships.countDocuments({})).toBe(1);
    expect(created).toHaveLength(1);
    expect((await listFriends(alex.id)).map((f) => f.userId)).toEqual([blair.id]);
    expect((await listFriends(blair.id)).map((f) => f.userId)).toEqual([alex.id]);
  });

  it("adding your own code is 409; a code stops working once a new one is issued", async () => {
    const first = await issueFriendCode(alex, ORIGIN);
    expect(await codeOf(addFriend(alex, first.code))).toBe("CONFLICT");
    await issueFriendCode(alex, ORIGIN);
    expect(await codeOf(addFriend(blair, first.code))).toBe("NOT_FOUND");
    expect(await codeOf(previewFriendCode(blair, first.code))).toBe("NOT_FOUND");
    expect(await codeOf(addFriend(blair, "not-a-code"))).toBe("NOT_FOUND");
  });

  it("rate limits code lookups to 20 a minute per user", async () => {
    for (let i = 0; i < 20; i++) expect(await codeOf(previewFriendCode(casey, "AAAAAAAAAAAAAAAAAAAA"))).toBe("NOT_FOUND");
    expect(await codeOf(previewFriendCode(casey, "AAAAAAAAAAAAAAAAAAAA"))).toBe("RATE_LIMITED");
    const { code } = await issueFriendCode(alex, ORIGIN);
    expect(await codeOf(addFriend(blair, code))).toBe("OK"); // other users are unaffected
  });
});

describe("activity invites", () => {
  async function hosted() {
    return createActivity(alex, { title: "Study group", placeId, category: "study", capacity: 2 });
  }

  it("only friends, only from an activity you're in", async () => {
    const a = await hosted();
    await befriend(alex, blair);
    expect(await codeOf(sendInvites(casey, { activityId: a.id, toUserIds: [blair.id] }))).toBe("FORBIDDEN");
    const result = await sendInvites(alex, { activityId: a.id, toUserIds: [blair.id, casey.id, alex.id] });
    expect(result.sent).toEqual([blair.id]);
    expect(result.skipped).toEqual([
      { userId: casey.id, reason: "not_friend" },
      { userId: alex.id, reason: "self" },
    ]);
    expect((await sendInvites(alex, { activityId: a.id, toUserIds: [blair.id] })).skipped).toEqual([
      { userId: blair.id, reason: "already_invited" },
    ]);
    const invites = await listInvites(blair.id);
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({ activityTitle: "Study group", from: { userId: alex.id, name: "Alex Dev" } });
    expect(await listInvites(casey.id)).toEqual([]);
  });

  it("accepting joins; a full activity returns CAPACITY_FULL and leaves the invite pending", async () => {
    const a = await hosted(); // capacity 2: Alex plus one
    await befriend(alex, blair);
    await befriend(alex, casey);
    await sendInvites(alex, { activityId: a.id, toUserIds: [blair.id, casey.id] });
    await joinActivity(drew, a.id); // fills it

    const [caseyInvite] = await listInvites(casey.id);
    expect(await codeOf(acceptInvite(casey, caseyInvite.id, {}))).toBe("CAPACITY_FULL");
    expect((await listInvites(casey.id))[0].id).toBe(caseyInvite.id);
  });

  it("accepting while in another activity: 409, or leave and join with leaveCurrent", async () => {
    const a = await hosted();
    await befriend(alex, blair);
    await sendInvites(alex, { activityId: a.id, toUserIds: [blair.id] });
    await createActivity(casey, { title: "Casey's", placeId, category: "social" });
    await befriend(casey, blair);
    await joinActivity(blair, (await getActiveParticipation(casey.id)).activity!.id);

    const [invite] = await listInvites(blair.id);
    expect(await codeOf(acceptInvite(blair, invite.id, {}))).toBe("ALREADY_IN_ACTIVITY");
    const joined = await acceptInvite(blair, invite.id, { leaveCurrent: true });
    expect(joined.activity.id).toBe(a.id);
    expect((await getActiveParticipation(blair.id)).activity?.id).toBe(a.id);
    expect(await codeOf(acceptInvite(blair, invite.id, {}))).toBe("CONFLICT"); // already accepted
  });

  it("accepting with leaveCurrent into a full or ended activity gives up nothing", async () => {
    const a = await hosted(); // capacity 2: Alex plus one
    await befriend(alex, casey);
    await befriend(alex, blair);
    await befriend(alex, drew);
    await sendInvites(alex, { activityId: a.id, toUserIds: [blair.id, casey.id, drew.id] });
    await joinActivity(drew, a.id); // fills it

    // Blair hosts their own activity; accepting into the full one must not end it
    const mine = await createActivity(blair, { title: "Blair's", placeId, category: "social" });
    const [invite] = await listInvites(blair.id);
    expect(await codeOf(acceptInvite(blair, invite.id, { leaveCurrent: true }))).toBe("CAPACITY_FULL");
    expect((await getActiveParticipation(blair.id)).activity?.id).toBe(mine.id);
    expect((await listInvites(blair.id)).map((i) => i.id)).toEqual([invite.id]);

    // Casey is a guest in Blair's; the invited activity ends, so they keep their place there
    await joinActivity(casey, mine.id);
    const [caseyInvite] = await listInvites(casey.id);
    await endActivityAsHost(alex, a.id);
    expect(await codeOf(acceptInvite(casey, caseyInvite.id, { leaveCurrent: true }))).toBe("ACTIVITY_ENDED");
    expect((await getActiveParticipation(casey.id)).activity?.id).toBe(mine.id);
  });

  it("declining, unfriending and the activity ending all clear the invite", async () => {
    const a = await hosted();
    await befriend(alex, blair);
    await befriend(alex, casey);
    await befriend(alex, drew);
    await sendInvites(alex, { activityId: a.id, toUserIds: [blair.id, casey.id, drew.id] });

    await declineInvite(blair, (await listInvites(blair.id))[0].id);
    expect(await listInvites(blair.id)).toEqual([]);

    await removeFriend(casey.id, alex.id);
    expect(await listInvites(casey.id)).toEqual([]);

    await endActivityAsHost(alex, a.id);
    expect(await listInvites(drew.id)).toEqual([]);
    expect(await t.cols.activity_invites.countDocuments({ toUserId: drew.id, status: "expired" })).toBe(1);
  });
});

describe("unfriending", () => {
  it("works from either side, expires invites both ways, emits once, and is safe to repeat", async () => {
    const ended: EventPayload<"friendship.ended">[] = [];
    bus.on("friendship.ended", "test:capture", (e) => void ended.push(e));
    try {
      const a = await createActivity(alex, { title: "Study group", placeId, category: "study" });
      const b = await createActivity(blair, { title: "Board games", placeId, category: "social" });
      await befriend(alex, blair);
      await sendInvites(alex, { activityId: a.id, toUserIds: [blair.id] });
      await sendInvites(blair, { activityId: b.id, toUserIds: [alex.id] });

      expect(await removeFriend(blair.id, alex.id)).toEqual({ ok: true });
      expect(await listFriends(alex.id)).toEqual([]);
      expect(await listFriends(blair.id)).toEqual([]);
      expect(await listInvites(alex.id)).toEqual([]);
      expect(await listInvites(blair.id)).toEqual([]);
      expect(await t.cols.activity_invites.countDocuments({ status: "expired" })).toBe(2);

      // again, the other way round, and someone who was never a friend: still ok, no second event
      expect(await removeFriend(alex.id, blair.id)).toEqual({ ok: true });
      expect(await removeFriend(alex.id, casey.id)).toEqual({ ok: true });
      expect(await removeFriend(alex.id, "seed-nobody")).toEqual({ ok: true });
      expect(ended).toHaveLength(1);

      // they can become friends again, and a fresh invite works
      await befriend(blair, alex);
      expect((await sendInvites(alex, { activityId: a.id, toUserIds: [blair.id] })).sent).toEqual([blair.id]);
    } finally {
      bus.off("friendship.ended", "test:capture");
    }
  });
});
