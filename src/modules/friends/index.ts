// Friends module: profiles, QR friend codes, the friends list and activity invites.
// Server-side only. There is no way to look people up: every function answers only for
// yourself, a friend, or the holder of a valid friend code.
export {
  areFriends,
  getMyProfile,
  getProfile,
  updateProfile,
  issueFriendCode,
  previewFriendCode,
  addFriend,
  listFriends,
  removeFriend,
  sendInvites,
  listInvites,
  acceptInvite,
  declineInvite,
} from "./service";
export { listMessages, sendMessage, markConversationRead, listConversations, countUnread } from "./messages";
export { rateLimit } from "./rate-limit";
export * as fixtures from "./fixtures";
