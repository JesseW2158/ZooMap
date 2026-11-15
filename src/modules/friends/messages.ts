import type { Conversation, DirectMessage, MessageDoc, UserDoc } from "@/shared/contracts";
import { getCollections, newId } from "@/shared/db";
import { ApiError } from "@/shared/http";
import { rateLimit } from "./rate-limit";
import { friendshipId } from "./rules";

/**
 * Direct messages between friends. Every function checks the friendship first, so a stranger
 * or an unfriended user gets 404 and their conversation drops out of the inbox, while the
 * history stays stored (it reappears if they become friends again).
 */

/** Sending: 30 messages per user per minute. */
const SENDS_PER_MINUTE = 30;
/** A thread loads its latest messages; older ones are not paged in this version. */
const THREAD_LIMIT = 200;

const notFound = () => new ApiError("NOT_FOUND", "Not found");

function toMessage(doc: MessageDoc): DirectMessage {
  return {
    id: doc._id,
    fromUserId: doc.fromUserId,
    toUserId: doc.toUserId,
    body: doc.body,
    createdAt: doc.createdAt.toISOString(),
    readAt: doc.readAt ? doc.readAt.toISOString() : null,
  };
}

/** The conversation id, or 404 unless the two are friends. */
async function conversationWith(userId: string, friendId: string): Promise<string> {
  if (userId === friendId) throw notFound();
  const { id } = friendshipId(userId, friendId);
  const { friendships } = await getCollections();
  if ((await friendships.countDocuments({ _id: id }, { limit: 1 })) === 0) throw notFound();
  return id;
}

/** A conversation, oldest first. `after` returns only messages at or after it, for polling (the client dedupes by id). */
export async function listMessages(userId: string, friendId: string, after?: Date): Promise<DirectMessage[]> {
  const conversationId = await conversationWith(userId, friendId);
  const { messages } = await getCollections();
  const docs = await messages
    .find({ conversationId, ...(after ? { createdAt: { $gte: after } } : {}) })
    .sort({ createdAt: -1, _id: -1 })
    .limit(THREAD_LIMIT)
    .toArray();
  return docs.reverse().map(toMessage);
}

export async function sendMessage(userId: string, friendId: string, body: string, now = new Date()): Promise<DirectMessage> {
  const conversationId = await conversationWith(userId, friendId);
  await rateLimit("dm", userId, SENDS_PER_MINUTE, 60_000, now);
  const doc: MessageDoc = { _id: newId(), conversationId, fromUserId: userId, toUserId: friendId, body: body.trim(), createdAt: now, readAt: null };
  const { messages } = await getCollections();
  await messages.insertOne(doc);
  return toMessage(doc);
}

/** Marks everything the friend sent you as read. Idempotent. */
export async function markConversationRead(userId: string, friendId: string, now = new Date()): Promise<{ ok: true }> {
  const conversationId = await conversationWith(userId, friendId);
  const { messages } = await getCollections();
  await messages.updateMany({ conversationId, toUserId: userId, readAt: null }, { $set: { readAt: now } });
  return { ok: true };
}

/** Your friends' conversation ids, keyed to the friend's user id. */
async function friendConversations(userId: string): Promise<Map<string, string>> {
  const { friendships } = await getCollections();
  const rows = await friendships.find({ userIds: userId }, { projection: { userIds: 1 } }).toArray();
  return new Map(rows.map((r) => [r._id, r.userIds[0] === userId ? r.userIds[1] : r.userIds[0]]));
}

/** Conversations with current friends that have at least one message, newest first. */
export async function listConversations(userId: string): Promise<Conversation[]> {
  const byConversation = await friendConversations(userId);
  if (byConversation.size === 0) return [];
  const ids = [...byConversation.keys()];
  const { messages, users, profiles } = await getCollections();

  const [lasts, unread] = await Promise.all([
    messages
      .aggregate<{ _id: string; last: MessageDoc }>([
        { $match: { conversationId: { $in: ids } } },
        { $sort: { conversationId: 1, createdAt: -1 } },
        { $group: { _id: "$conversationId", last: { $first: "$$ROOT" } } },
      ])
      .toArray(),
    messages
      .aggregate<{ _id: string; n: number }>([
        { $match: { toUserId: userId, readAt: null, conversationId: { $in: ids } } },
        { $group: { _id: "$conversationId", n: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  const unreadBy = new Map(unread.map((u) => [u._id, u.n]));

  const friendIds = lasts.map((l) => byConversation.get(l._id)!);
  const [userDocs, profileDocs] = await Promise.all([
    users.find({ _id: { $in: friendIds } }, { projection: { name: 1, image: 1 } }).toArray(),
    profiles.find({ _id: { $in: friendIds } }, { projection: { pronouns: 1 } }).toArray(),
  ]);
  const userBy = new Map<string, Pick<UserDoc, "_id" | "name" | "image">>(userDocs.map((u) => [u._id, u]));
  const pronounsBy = new Map(profileDocs.map((p) => [p._id, p.pronouns ?? null]));

  return lasts
    .flatMap((l): Conversation[] => {
      const friendId = byConversation.get(l._id)!;
      const u = userBy.get(friendId);
      if (!u) return [];
      return [
        {
          friend: { userId: friendId, name: u.name, image: u.image ?? null, pronouns: pronounsBy.get(friendId) ?? null },
          lastMessage: toMessage(l.last),
          unread: unreadBy.get(l._id) ?? 0,
        },
      ];
    })
    .sort((a, b) => b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt));
}

/** Unread messages from current friends, for the tab badge. */
export async function countUnread(userId: string): Promise<{ count: number }> {
  const byConversation = await friendConversations(userId);
  if (byConversation.size === 0) return { count: 0 };
  const { messages } = await getCollections();
  const count = await messages.countDocuments({ toUserId: userId, readAt: null, conversationId: { $in: [...byConversation.keys()] } });
  return { count };
}
