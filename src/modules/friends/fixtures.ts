import type { ActivityInvite, Conversation, DirectMessage, Friend, FriendCode, FriendPreview, InviteResult, Profile } from "@/shared/contracts";

/** Contract-valid sample bodies for the route test, which runs without a database. */

export function profileFixture(userId: string, name: string): Profile {
  return {
    userId,
    name,
    image: null,
    pronouns: "they/them",
    phone: "+14135550100",
    email: "friend@example.com",
    socials: [
      { kind: "instagram", handle: "umass", url: "https://www.instagram.com/umass" },
      { kind: "discord", handle: "zoomap", url: null },
    ],
  };
}

export function friendFixture(userId = "seed-blair", now = new Date()): Friend {
  return { ...profileFixture(userId, "Blair Dev"), since: now.toISOString() };
}

export function friendCodeFixture(): FriendCode {
  return { code: "ABCD-EFGH-JKLM-NPQR-STUV", url: "http://localhost:3000/add/ABCDEFGHJKLMNPQRSTUV" };
}

export function previewFixture(): FriendPreview {
  return { userId: "seed-blair", name: "Blair Dev", image: null, pronouns: null, alreadyFriends: false, self: false };
}

export function inviteResultFixture(toUserIds: string[]): InviteResult {
  return { sent: toUserIds, skipped: [] };
}

export function inviteFixture(now = new Date()): ActivityInvite {
  return {
    id: "fixture-invite-1",
    activityId: "fixture-activity-1",
    activityTitle: "Calc II study group",
    activityStatus: "active",
    placeId: "r4054634",
    placeName: "W.E.B. Du Bois Library",
    from: { userId: "seed-alex", name: "Alex Dev", image: null, pronouns: null },
    status: "pending",
    createdAt: now.toISOString(),
  };
}

export function messageFixture(fromUserId = "seed-blair", toUserId = "seed-alex", now = new Date()): DirectMessage {
  return { id: "fixture-message-1", fromUserId, toUserId, body: "Meet at the library?", createdAt: now.toISOString(), readAt: null };
}

export function conversationFixture(now = new Date()): Conversation {
  return {
    friend: { userId: "seed-blair", name: "Blair Dev", image: null, pronouns: "they/them" },
    lastMessage: messageFixture("seed-blair", "seed-alex", now),
    unread: 1,
  };
}
