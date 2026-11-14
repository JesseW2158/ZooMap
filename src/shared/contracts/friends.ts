import { z } from "zod";
import { ActivityStatus } from "./activities";
import { Id, IsoTime } from "./common";

/**
 * Friends (owner: ws-friends). Profiles, QR friend codes, the friends list and activity
 * invites. There is no way to look people up: every route answers only for yourself, a
 * friend, or the holder of a valid friend code.
 */

export const SocialKind = z.enum(["instagram", "x", "linkedin", "github", "snapchat", "tiktok", "discord", "website"]);
export type SocialKind = z.infer<typeof SocialKind>;

/** What a user stores: a handle (an https URL only for `website`). The server builds links. */
export const SocialInput = z.strictObject({
  kind: SocialKind,
  handle: z.string().trim().min(1).max(200),
});
export type SocialInput = z.infer<typeof SocialInput>;

/**
 * A social link as returned: `url` is built by the server from a fixed table and is always
 * https, or null where the service has no public profile URL for a username (Discord).
 */
export const SocialLink = z.object({
  kind: SocialKind,
  handle: z.string(),
  url: z.url({ protocol: /^https$/ }).nullable(),
});
export type SocialLink = z.infer<typeof SocialLink>;

/** What anyone holding your current friend code sees. */
export const PublicProfile = z.object({
  userId: Id,
  name: z.string(),
  image: z.string().nullable(),
  pronouns: z.string().nullable(),
});
export type PublicProfile = z.infer<typeof PublicProfile>;

/** What you and your friends see. */
export const Profile = PublicProfile.extend({
  /** E.164, for a `tel:` link. */
  phone: z.string().nullable(),
  /** For a `mailto:` link. Empty unless the user filled it in. */
  email: z.string().nullable(),
  socials: z.array(SocialLink),
});
export type Profile = z.infer<typeof Profile>;

/** PUT /api/profile/me. Omitted fields are unchanged; null or "" clears. */
export const ProfileUpdateBody = z.strictObject({
  pronouns: z.string().trim().max(40).nullable().optional(),
  /** Any common format; stored as E.164 (10-digit numbers are taken as US). */
  phone: z.string().trim().max(30).nullable().optional(),
  contactEmail: z.string().trim().max(200).nullable().optional(),
  socials: z.array(SocialInput).max(8).optional(),
});
export type ProfileUpdateBody = z.infer<typeof ProfileUpdateBody>;

/** POST /api/friends/code: a fresh code (the previous one stops working) and the link the QR encodes. */
export const FriendCode = z.object({
  code: z.string().min(1),
  url: z.string().min(1),
});
export type FriendCode = z.infer<typeof FriendCode>;

/** GET /api/friends/preview?code= */
export const FriendPreviewQuery = z.object({ code: z.string().trim().min(1).max(64) });
export const FriendPreview = PublicProfile.extend({
  /** True when you are already friends (or it is your own code: see `self`). */
  alreadyFriends: z.boolean(),
  self: z.boolean(),
});
export type FriendPreview = z.infer<typeof FriendPreview>;

/** POST /api/friends */
export const AddFriendBody = z.strictObject({ code: z.string().trim().min(1).max(64) });
export type AddFriendBody = z.infer<typeof AddFriendBody>;

export const Friend = Profile.extend({ since: IsoTime });
export type Friend = z.infer<typeof Friend>;
export const FriendList = z.array(Friend);

export const InviteStatus = z.enum(["pending", "accepted", "declined", "expired"]);
export type InviteStatus = z.infer<typeof InviteStatus>;

/** POST /api/friends/invites */
export const InviteBody = z.strictObject({
  activityId: Id,
  toUserIds: z.array(Id).min(1).max(50),
});
export type InviteBody = z.infer<typeof InviteBody>;

export const InviteSkipReason = z.enum(["not_friend", "self", "already_invited", "already_in_activity"]);
export const InviteResult = z.object({
  sent: z.array(Id),
  skipped: z.array(z.object({ userId: Id, reason: InviteSkipReason })),
});
export type InviteResult = z.infer<typeof InviteResult>;

/** A pending invite as shown to its recipient. */
export const ActivityInvite = z.object({
  id: Id,
  activityId: Id,
  activityTitle: z.string(),
  activityStatus: ActivityStatus,
  placeId: Id,
  placeName: z.string().nullable(),
  from: PublicProfile,
  status: InviteStatus,
  createdAt: IsoTime,
});
export type ActivityInvite = z.infer<typeof ActivityInvite>;
export const InviteList = z.array(ActivityInvite);

/** POST /api/friends/invites/:id/accept. `leaveCurrent` leaves the activity you are in first. */
export const AcceptInviteBody = z.strictObject({ leaveCurrent: z.boolean().optional() });
export type AcceptInviteBody = z.infer<typeof AcceptInviteBody>;
