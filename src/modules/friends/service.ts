import type {
  AcceptInviteBody,
  ActivityInvite,
  AuthUser,
  Friend,
  FriendCode,
  FriendPreview,
  InviteBody,
  InviteResult,
  ParticipationResult,
  Profile,
  ProfileDoc,
  ProfileUpdateBody,
  PublicProfile,
  UserDoc,
} from "@/shared/contracts";
import { getCollections, isDuplicateKeyError, newId } from "@/shared/db";
import { emit } from "@/shared/events";
import { ApiError } from "@/shared/http";
import { getActiveParticipation, joinActivity, leaveActivity, listActiveActivities } from "@/modules/activities";
import { rateLimit } from "./rate-limit";
import {
  formatCode,
  friendshipId,
  hashCode,
  newFriendCode,
  normalizeCode,
  normalizeEmail,
  normalizePhone,
  normalizeSocial,
  socialLink,
} from "./rules";

type User = Pick<AuthUser, "id" | "email" | "name">;

/** 20 friend-code lookups (previews and adds together) per user per minute. */
const CODE_LOOKUPS_PER_MINUTE = 20;

const notFound = () => new ApiError("NOT_FOUND", "Not found");

// ------------------------------------------------------------------ profiles

type UserBits = Pick<UserDoc, "_id" | "name" | "image">;

function toPublic(user: UserBits, profile: ProfileDoc | null | undefined): PublicProfile {
  return { userId: user._id, name: user.name, image: user.image ?? null, pronouns: profile?.pronouns ?? null };
}

function toProfile(user: UserBits, profile: ProfileDoc | null | undefined): Profile {
  return {
    ...toPublic(user, profile),
    phone: profile?.phone ?? null,
    email: profile?.contactEmail ?? null,
    socials: (profile?.socials ?? []).map(socialLink),
  };
}

/** Users and their profiles by id, in two queries. */
async function loadPeople(ids: string[]): Promise<Map<string, { user: UserBits; profile: ProfileDoc | null }>> {
  const { users, profiles } = await getCollections();
  const [userDocs, profileDocs] = await Promise.all([
    users.find({ _id: { $in: ids } }, { projection: { name: 1, image: 1 } }).toArray(),
    profiles.find({ _id: { $in: ids } }).toArray(),
  ]);
  const byId = new Map(profileDocs.map((p) => [p._id, p]));
  return new Map(userDocs.map((u) => [u._id, { user: u, profile: byId.get(u._id) ?? null }]));
}

async function person(id: string) {
  return (await loadPeople([id])).get(id) ?? null;
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const { friendships } = await getCollections();
  return (await friendships.countDocuments({ _id: friendshipId(a, b).id }, { limit: 1 })) > 0;
}

/** Your own profile. */
export async function getMyProfile(user: User): Promise<Profile> {
  const me = await person(user.id);
  if (!me) throw notFound();
  return toProfile(me.user, me.profile);
}

/** A profile you may see: your own or a friend's. Anyone else is 404, never 403. */
export async function getProfile(viewerId: string, userId: string): Promise<Profile> {
  if (viewerId !== userId && !(await areFriends(viewerId, userId))) throw notFound();
  const p = await person(userId);
  if (!p) throw notFound();
  return toProfile(p.user, p.profile);
}

/** Update your profile. Omitted fields stay; null or "" clears. */
export async function updateProfile(user: User, body: ProfileUpdateBody, now = new Date()): Promise<Profile> {
  const set: Partial<ProfileDoc> = { updatedAt: now };
  const unset: Record<string, ""> = {};
  const field = <K extends "pronouns" | "phone" | "contactEmail">(key: K, value: string | null | undefined, clean: (v: string) => string) => {
    if (value === undefined) return;
    if (value === null || value.trim() === "") unset[key] = "";
    else set[key] = clean(value) as ProfileDoc[K];
  };
  field("pronouns", body.pronouns, (v) => v.trim());
  field("phone", body.phone, normalizePhone);
  field("contactEmail", body.contactEmail, normalizeEmail);
  if (body.socials) set.socials = body.socials.map(normalizeSocial);

  const { profiles } = await getCollections();
  // MongoDB rejects an empty operator, so add $unset and $setOnInsert only when they have fields.
  await profiles.updateOne(
    { _id: user.id },
    {
      $set: set,
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
      ...(body.socials ? {} : { $setOnInsert: { socials: [] } }),
    },
    { upsert: true },
  );
  return getMyProfile(user);
}

// ------------------------------------------------------------------ friend codes

/**
 * A fresh friend code. Only its hash is stored, so the previous code stops working: a code
 * is good while it is on someone's screen. `origin` is the site the QR link points at.
 */
export async function issueFriendCode(user: User, origin: string, now = new Date()): Promise<FriendCode> {
  const { profiles } = await getCollections();
  for (let attempt = 0; ; attempt++) {
    const code = newFriendCode();
    try {
      await profiles.updateOne(
        { _id: user.id },
        { $set: { friendCodeHash: hashCode(code), friendCodeIssuedAt: now, updatedAt: now }, $setOnInsert: { socials: [] } },
        { upsert: true },
      );
      return { code: formatCode(code), url: `${origin.replace(/\/$/, "")}/add/${normalizeCode(code)}` };
    } catch (error) {
      // a 100-bit collision is not going to happen, but the unique index would catch it
      if (!isDuplicateKeyError(error) || attempt >= 2) throw error;
    }
  }
}

async function ownerOfCode(viewerId: string, code: string) {
  await rateLimit("friend-code", viewerId, CODE_LOOKUPS_PER_MINUTE, 60_000);
  const normalized = normalizeCode(code);
  if (!/^[A-Z2-9]{20}$/.test(normalized)) throw notFound();
  const { profiles } = await getCollections();
  const owner = await profiles.findOne({ friendCodeHash: hashCode(normalized) }, { projection: { _id: 1 } });
  if (!owner) throw notFound();
  return owner._id;
}

/** Who a code belongs to: the public part only (name, photo, pronouns). */
export async function previewFriendCode(viewer: User, code: string): Promise<FriendPreview> {
  const ownerId = await ownerOfCode(viewer.id, code);
  const p = await person(ownerId);
  if (!p) throw notFound();
  const self = ownerId === viewer.id;
  return { ...toPublic(p.user, p.profile), self, alreadyFriends: !self && (await areFriends(viewer.id, ownerId)) };
}

/**
 * Add the owner of `code` as a friend. Showing your code is the consent, so the friendship is
 * mutual at once. Adding again (or two racing adds) returns the existing friendship, and only
 * the insert that created it emits `friendship.created`.
 */
export async function addFriend(viewer: User, code: string, now = new Date()): Promise<Friend> {
  const ownerId = await ownerOfCode(viewer.id, code);
  if (ownerId === viewer.id) throw new ApiError("CONFLICT", "That's your own code");
  const { id, userIds } = friendshipId(viewer.id, ownerId);
  const { friendships } = await getCollections();
  let since = now;
  try {
    await friendships.insertOne({ _id: id, userIds, createdAt: now, via: "qr" });
    await emit("friendship.created", { friendshipId: id, userIds, at: now });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    since = (await friendships.findOne({ _id: id }))?.createdAt ?? now;
  }
  const p = await person(ownerId);
  if (!p) throw notFound();
  return { ...toProfile(p.user, p.profile), since: since.toISOString() };
}

// ------------------------------------------------------------------ friends list

/** Your friends with their full profiles, by name. */
export async function listFriends(userId: string): Promise<Friend[]> {
  const { friendships } = await getCollections();
  const rows = await friendships.find({ userIds: userId }).toArray();
  const otherOf = (ids: [string, string]) => (ids[0] === userId ? ids[1] : ids[0]);
  const people = await loadPeople(rows.map((r) => otherOf(r.userIds)));
  return rows
    .flatMap((r) => {
      const p = people.get(otherOf(r.userIds));
      return p ? [{ ...toProfile(p.user, p.profile), since: r.createdAt.toISOString() }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Unfriend, for both people. Pending invites between them expire. Idempotent. */
export async function removeFriend(userId: string, otherId: string, now = new Date()): Promise<{ ok: true }> {
  const { id, userIds } = friendshipId(userId, otherId);
  const { friendships, activity_invites } = await getCollections();
  const removed = await friendships.deleteOne({ _id: id });
  await activity_invites.updateMany(
    {
      status: "pending",
      $or: [
        { fromUserId: userId, toUserId: otherId },
        { fromUserId: otherId, toUserId: userId },
      ],
    },
    { $set: { status: "expired", respondedAt: now } },
  );
  if (removed.deletedCount) await emit("friendship.ended", { friendshipId: id, userIds, at: now });
  return { ok: true };
}

// ------------------------------------------------------------------ invites

/**
 * Invite friends to the activity you are in. Recipients who are not friends, are already
 * invited or are already in it are skipped and reported, not an error.
 */
export async function sendInvites(user: User, body: InviteBody, now = new Date()): Promise<InviteResult> {
  const me = await getActiveParticipation(user.id, now);
  if (!me.participation || me.activity?.id !== body.activityId) {
    throw new ApiError("FORBIDDEN", "You can only invite friends to an activity you're in");
  }
  const { activity_invites } = await getCollections();
  const result: InviteResult = { sent: [], skipped: [] };
  for (const toUserId of [...new Set(body.toUserIds)]) {
    if (toUserId === user.id) {
      result.skipped.push({ userId: toUserId, reason: "self" });
      continue;
    }
    if (!(await areFriends(user.id, toUserId))) {
      result.skipped.push({ userId: toUserId, reason: "not_friend" });
      continue;
    }
    if ((await getActiveParticipation(toUserId, now)).activity?.id === body.activityId) {
      result.skipped.push({ userId: toUserId, reason: "already_in_activity" });
      continue;
    }
    const inviteId = newId();
    try {
      await activity_invites.insertOne({
        _id: inviteId,
        activityId: body.activityId,
        fromUserId: user.id,
        toUserId,
        status: "pending",
        createdAt: now,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      result.skipped.push({ userId: toUserId, reason: "already_invited" });
      continue;
    }
    result.sent.push(toUserId);
    await emit("activity.invite.created", { inviteId, activityId: body.activityId, fromUserId: user.id, toUserId, at: now });
  }
  return result;
}

/** Your pending invites. Invites to activities that are no longer active become `expired` first. */
export async function listInvites(userId: string, now = new Date()): Promise<ActivityInvite[]> {
  const { activity_invites } = await getCollections();
  const pending = await activity_invites.find({ toUserId: userId, status: "pending" }).sort({ createdAt: -1 }).toArray();
  if (pending.length === 0) return [];
  const active = new Map((await listActiveActivities(now)).map((a) => [a.id, a]));
  const stale = pending.filter((i) => !active.has(i.activityId)).map((i) => i._id);
  if (stale.length) {
    await activity_invites.updateMany({ _id: { $in: stale }, status: "pending" }, { $set: { status: "expired", respondedAt: now } });
  }
  const live = pending.filter((i) => active.has(i.activityId));
  const people = await loadPeople([...new Set(live.map((i) => i.fromUserId))]);
  return live.flatMap((i) => {
    const a = active.get(i.activityId)!;
    const from = people.get(i.fromUserId);
    if (!from) return [];
    return [
      {
        id: i._id,
        activityId: a.id,
        activityTitle: a.title,
        activityStatus: a.status,
        placeId: a.placeId,
        placeName: a.placeName ?? null,
        from: toPublic(from.user, from.profile),
        status: i.status,
        createdAt: i.createdAt.toISOString(),
      },
    ];
  });
}

async function myPendingInvite(userId: string, inviteId: string) {
  const { activity_invites } = await getCollections();
  const invite = await activity_invites.findOne({ _id: inviteId, toUserId: userId });
  if (!invite) throw notFound();
  if (invite.status !== "pending") throw new ApiError("CONFLICT", `This invite was already ${invite.status}`);
  return invite;
}

/**
 * Accept: join the activity through the activities module, so capacity and one-activity-at-a-
 * time still apply and its errors pass through unchanged (the invite stays pending). Being in
 * another activity is refused (ALREADY_IN_ACTIVITY) unless the caller confirms with
 * `leaveCurrent`, which leaves it first (a host leaving ends theirs). The invited activity is
 * checked (still active, not full) before anything is left, so a failed accept costs nothing.
 */
export async function acceptInvite(user: User, inviteId: string, body: AcceptInviteBody, now = new Date()): Promise<ParticipationResult> {
  const invite = await myPendingInvite(user.id, inviteId);
  const { activity_invites } = await getCollections();
  const markAccepted = () =>
    activity_invites.updateOne({ _id: invite._id, status: "pending" }, { $set: { status: "accepted", respondedAt: now } });

  const current = await getActiveParticipation(user.id, now);
  if (current.participation && current.activity?.id === invite.activityId) {
    await markAccepted();
    return { participation: current.participation, activity: current.activity };
  }
  if (current.participation && current.activity && body.leaveCurrent) {
    // Leaving cannot be undone (a host leaving ends theirs for everyone), so make sure the
    // invited activity can still be joined before giving anything up.
    const target = (await listActiveActivities(now)).find((a) => a.id === invite.activityId);
    if (!target) throw new ApiError("ACTIVITY_ENDED", "This activity has ended");
    if (target.capacity !== undefined && target.participantCount >= target.capacity) {
      throw new ApiError("CAPACITY_FULL", "This activity is full");
    }
    await leaveActivity(user, current.activity.id, now);
  }
  const joined = await joinActivity(user, invite.activityId, now);
  await markAccepted();
  return joined;
}

export async function declineInvite(user: User, inviteId: string, now = new Date()): Promise<{ ok: true }> {
  const invite = await myPendingInvite(user.id, inviteId);
  const { activity_invites } = await getCollections();
  await activity_invites.updateOne({ _id: invite._id, status: "pending" }, { $set: { status: "declined", respondedAt: now } });
  return { ok: true };
}
