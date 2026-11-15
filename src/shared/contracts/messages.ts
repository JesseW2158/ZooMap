import { z } from "zod";
import { Id, IsoTime } from "./common";
import { PublicProfile } from "./friends";

/**
 * Direct messages between friends (owner: friends). Only friends can message each other;
 * after an unfriend the conversation is hidden from both and every route answers 404,
 * while the history stays stored.
 */

export const DM_MAX_LENGTH = 1000;

export const DirectMessage = z.object({
  id: Id,
  fromUserId: Id,
  toUserId: Id,
  body: z.string(),
  createdAt: IsoTime,
  /** When the recipient opened it; null while unread. */
  readAt: IsoTime.nullable(),
});
export type DirectMessage = z.infer<typeof DirectMessage>;
export const DirectMessageList = z.array(DirectMessage);

/** GET /api/messages/:friendId?after= : oldest first; `after` returns messages at or after it (for polling). */
export const MessagesQuery = z.object({ after: IsoTime.optional() });
export type MessagesQuery = z.infer<typeof MessagesQuery>;

/** POST /api/messages/:friendId */
export const SendMessageBody = z.strictObject({ body: z.string().trim().min(1).max(DM_MAX_LENGTH) });
export type SendMessageBody = z.infer<typeof SendMessageBody>;

/** One row of the inbox: a friend you have messages with, newest conversation first. */
export const Conversation = z.object({
  friend: PublicProfile,
  lastMessage: DirectMessage,
  /** Messages from the friend you have not read. */
  unread: z.number().int().nonnegative(),
});
export type Conversation = z.infer<typeof Conversation>;
export const ConversationList = z.array(Conversation);

/** GET /api/messages/unread : for the Friends tab badge. */
export const UnreadCount = z.object({ count: z.number().int().nonnegative() });
export type UnreadCount = z.infer<typeof UnreadCount>;
