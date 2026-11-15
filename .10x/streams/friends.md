# Stream: friends

Branch `ws-friends`, worktree `../ZooMap-friends-plan`. Brief: `docs/plan/ws-friends.md`.

## Status (2026-11-14)

Done-when list:
- [x] Tests (`src/modules/friends/rules.test.ts`, `friends.db.test.ts`): a stranger, a guessed id and an unfriended user get 404; ten concurrent adds make one friendship and one `friendship.created`; your own code is 409; a superseded code is 404; social links are https or null and `javascript:` is refused; invites go only to friends and only from the activity you're in; accepting a full activity is `CAPACITY_FULL` and leaves the invite pending; invites expire on decline, unfriend and the activity ending; accepting with `leaveCurrent` leaves and joins; code lookups are rate limited at 20/min.
- [x] Two dev users against the dev server (`npm run dev -- -p 3002`): Alex shows a code, Blair opens `/add/<code>` (signed-out visitors go through sign-in and back), previews only name/photo/pronouns, adds; Alex hosts and invites Blair (a non-friend is skipped); Blair accepts and is in the activity. Screens checked in headless Chromium: invite banner, Friends tab, full-screen QR.
- [x] `npm run check` green on Atlas (269 tests, `MONGODB_DB=zoomap_friends`); `npm run build` green.
- [ ] Not checked: scanning the QR with a real phone camera (no QR decoder on the dev machine), and the in-app Scan button (needs Chrome on Android or the Android shell).

## Owner decisions (2026-11-14)

- `qrcode@1.5.4` (+ `@types/qrcode@1.5.6`) added, own commit.
- Contact details (phone, email, socials) visible to friends only; a code holder sees name, photo, pronouns.
- Photos: the Google picture only, initials fallback. Uploads are stretch.
- Friend codes are stored **only as a SHA-256 hash**, so opening "My code" issues a fresh code and the previous one stops working. A code stays valid until its owner reopens "My code".
- Sign-in page accepts `?next=` (same-site paths only) so `/add/<code>` survives the sign-in hop.
- Rate limit counter in MongoDB (`rate_limits`, TTL), so it holds across serverless instances.
- New collections registered in the shared collection map, indexes in `indexes.ts`.
- Invite UI in the Friends tab only; accepting while in another activity offers "Leave and join" (hosts warned it ends theirs).
- New invites show in a banner over the map (headless registry entry), polled every 15 s.
- No in-app scanner fallback beyond a hint to use the camera app; unfriend is a two-tap button.

## Changes outside `src/modules/friends` (each its own commit)

- `package.json` / lockfile: qrcode.
- `src/shared/contracts/`: `friends.ts`, documents (`ProfileDoc`, `FriendshipDoc`, `ActivityInviteDoc`, `RateLimitDoc`), events (`friendship.created`, `friendship.ended`, `activity.invite.created`), 13 routes in `API_ROUTES`. `SocialLink.url` is null for Discord.
- `src/shared/db/`: four collections in the map; indexes (unique sparse `profiles.friendCodeHash`, `friendships.userIds`, unique partial pending invite per person per activity, `activity_invites` by recipient, TTL on `rate_limits`). Run `npm run db:setup` after merging.
- `src/app/signin/page.tsx`: `?next=`.
- `src/app/registry.ts`: Friends tab and `friends-invite-banner`.
- `src/app/api/routes.test.ts`: mocks `@/modules/friends` with its fixtures; samples for the new routes.

## Notes for others

- Friends reads activities only through its index (`getActiveParticipation`, `joinActivity`, `leaveActivity`, `listActiveActivities`). It has no event subscriptions, so it is not in `src/shared/events/subscribers.ts`; invites to ended activities expire when read.
- Events emitted: `friendship.created` / `friendship.ended` (once each), `activity.invite.created`. A reward rule could use them.
- `.env.local` needs `ENCRYPTION_KEY` for the schedule DB tests (not a friends requirement, but `npm run check` fails without it).
- The invite banner sits under the search bar and over the top-right map controls until dismissed.

## Direct messages (ws/messages, 2026-11-14)

Owner decisions: Friends gets its own bottom tab (7th, after Points); a chat opens as a full-screen overlay; v1 has an inbox, unread badges, and unfriend hides the chat. No offline retry queue.

- Contracts (own commit): `messages.ts` (`DirectMessage`, `Conversation`, `SendMessageBody` max 1000 chars, `UnreadCount`), `MessageDoc`, five routes: `GET /api/messages` (inbox), `GET /api/messages/unread`, `GET|POST /api/messages/[friendId]` (`?after=` for polling, `$gte`, client dedupes by id), `POST /api/messages/[friendId]/read`.
- DB (own commit): `messages` collection; indexes `conversationId_createdAt`, `toUserId_readAt`. **Run `npm run db:setup` after merging.**
- Service `src/modules/friends/messages.ts`: every call checks the friendship (stranger / self / unfriended → 404). `conversationId` = friendship id. Unfriend leaves the history stored; it reappears if they re-friend. Sending rate limited at 30/min (`rate_limits`, bucket `dm`). Thread returns the latest 200.
- Polling: open chat 3 s, inbox 10 s while the Friends tab is open, tab badge 20 s (paused when the page is hidden). The friends UI fires `window` event `zoomap:messages-changed` after read/send so the shell badge refreshes at once.
- Shell (`src/app/_shell/AppShell.tsx`, `icons.tsx`, `globals.css`): Friends tab with `FriendsIcon`, accent `--color-rose`, a badge on the tab. The Map tab is no longer exactly centred with seven tabs.
- Tests: `messages.db.test.ts` (send/thread order, 404s, `after`, unread counts and read marks, unfriend hides for both and blocks sending, rate limit). **Not run yet**: no `MONGODB_URI` in this worktree. Unit tests, lint, typecheck and `npm run build` pass.
