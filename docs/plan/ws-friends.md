# Workstream: friends

Profiles, adding friends in person with a QR code, the friends list, and inviting friends to activities. There is deliberately no way to find people you have not met: no search, no directory, no suggestions.

**Owns:** `src/modules/friends/**`, `src/app/api/friends/**`, `src/app/api/profile/**`, `src/app/add/[code]/**` (the page a scanned code opens).
**Provides:** `getProfile(viewerId, userId)`, `areFriends(a, b)`, `listFriends(userId)`, the `friendship.created`, `friendship.ended` and `activity.invite.created` events, the friends panel.
**Consumes:** auth (the user row, `users.image`), activities (`getActiveParticipation`, `joinActivity`, `activity.ended`). Import activities only through its `index.ts`.

Needs from the owner before starting (see "Open questions"): a yes for one QR library, and the default for who sees contact details.

## Contract changes (one additive commit, `src/shared/contracts/` only)

- `ProfileDoc` (`profiles`, `_id` = userId): `pronouns?`, `phone?` (E.164), `contactEmail?`, `socials: { kind, handle }[]`, `friendCodeHash`, `friendCodeRotatedAt`, `updatedAt`. Name and photo stay on `users` (written by auth); the profile never duplicates them.
- `FriendshipDoc` (`friendships`): `_id` = the two user ids sorted and joined with `:`, `userIds: [a, b]`, `createdAt`, `via: 'qr'`. The `_id` makes a pair unique without an extra index and makes adding idempotent.
- `ActivityInviteDoc` (`activity_invites`): `activityId`, `fromUserId`, `toUserId`, `status: 'pending' | 'accepted' | 'declined' | 'expired'`, `createdAt`, `respondedAt?`.
- API shapes: `Profile` (public part: `userId, name, image?, pronouns?`; contact part: `phone?, email?, socials[]` with each social's built URL), `ProfileUpdateBody`, `FriendCode` (`{ code, url }`), `FriendList`, `ActivityInvite` (with the activity's title, place name and inviter's name), and the routes below in `API_ROUTES`.
- Events: `friendship.created { friendshipId, userIds, at }`, `friendship.ended { friendshipId, userIds, at }`, `activity.invite.created { inviteId, activityId, fromUserId, toUserId, at }`.
- `SocialKind` enum: `instagram, x, linkedin, github, snapchat, tiktok, discord, website`.

Indexes (one commit touching only `src/shared/db/indexes.ts`): `profiles.friendCodeHash` unique; `friendships.userIds`; `activity_invites` unique partial `{ activityId, toUserId }` where `status: 'pending'`, and `{ toUserId, status }`.

## Profiles

- Everyone has a profile from first sign-in; the panel lets the user fill it in. Photo is `users.image` (the Google picture) with an initials fallback; no uploads in the main scope.
- **Who sees what.** A friend sees the full profile. Anyone holding a valid friend code sees only the public part (name, photo, pronouns) on the add page, so a code photographed off someone's screen does not leak their phone number. Everyone else gets 404, never 403, so the API does not confirm who has an account. Activity host names stay as they are today.
- **Links are built by the server.** Store `phone` (validated to E.164), `contactEmail` (validated, any domain, defaults to empty: the sign-in email is not shown unless the user copies it in) and social *handles*, never URLs. The server turns a handle into `https://instagram.com/<handle>` and so on from a fixed table, and the client renders `tel:`, `mailto:` and those URLs only. This rules out `javascript:` and look-alike links. `website` is the one free URL: `https` only, max 200 characters.
- Every field is optional and clearable. Pronouns are free text, max 40 characters.

## Friend codes

- A code is 20 random characters from a 32-letter alphabet (about 100 bits), shown as a QR of `${NEXT_PUBLIC_APP_URL}/add/<code>` and as text. Store only its SHA-256 (`friendCodeHash`), like device tokens. Generate on first view of the code.
- **Rotate** button: new code, old one stops working at once. Codes do not expire otherwise.
- **Scanning.** Two paths, both landing on `/add/<code>`:
  1. The phone's own camera reads the QR and opens the URL (works on iPhone and Android with no app code).
  2. A "Scan" button in the panel uses the browser's `BarcodeDetector` where it exists (Chrome on Android, the Android shell) with `getUserMedia`; where it does not, the button explains to use the camera app.
- `/add/<code>` (signed in; redirect through sign-in and back if not) shows the public profile and an **Add friend** button. Adding is `POST /api/friends { code }`: hash, look up, refuse your own code (409 `CONFLICT`), upsert the friendship by its `_id`. A repeat or a race returns the existing friendship (200), and only the insert that created it emits `friendship.created`. Showing your code to someone is the consent, so the friendship is mutual at once; there are no requests to accept.
- Rate limit code lookups to 20 per user per minute (429 `RATE_LIMITED`); a miss is 404 with no detail.

## Friends list

- `GET /api/friends` returns the user's friends with their full profiles, sorted by name. Unfriend is `DELETE /api/friends/:userId`; it removes the friendship for both, emits `friendship.ended`, and cancels pending invites between them.
- **No discovery.** No route lists, searches or suggests users. `GET /api/profile/:userId` answers only for yourself or a friend. Test that a stranger's id, a guessed id and a seed user's id all return 404.

## Inviting friends to activities

- `POST /api/friends/invites { activityId, toUserIds[] }`: the sender must have an active participation in that activity (host or guest) and each recipient must be a friend; anyone else is skipped and reported, not an error. The unique partial index makes a second pending invite to the same person a no-op. Emits `activity.invite.created` per new invite.
- `GET /api/friends/invites` returns the user's pending invites; settle first: invites whose activity is no longer active become `expired` (also on `activity.ended`).
- `POST /api/friends/invites/:id/accept` calls `joinActivity` from the activities module and passes its errors through unchanged (409 `ALREADY_IN_ACTIVITY`, `CAPACITY_FULL`, `ACTIVITY_ENDED`); the invite becomes `accepted` only if the join succeeded. `/decline` sets `declined`.
- An invite does not bypass anything: capacity, one-activity-at-a-time and the activity's public visibility are unchanged.

## Client

- A **Friends** panel: your profile card (edit form for pronouns, phone, email, socials) and **My code** (QR, the text code, rotate); a **Scan** button; the friends list (photo, name, pronouns, tap for the full profile with call, email and social buttons, unfriend); and pending invites with accept and decline, accepting flies the map to the place.
- While you are in an activity, the friends list shows **Invite** checkboxes and a send button.
- Poll pending invites every 15 seconds while signed in (a small count on the panel tab title is enough; there are no push notifications).
- The `/add/<code>` page works without the map loading, so it opens fast from a camera scan.
- `src/app/registry.ts` is frozen: ask the owner (or integration) to add one line, `{ id: "friends", title: "Friends", Component: FriendsPanel }`. Until then, develop against `/add/<code>` and a temporary dev route inside the module.

## Done when

- Tests cover: a stranger, a guessed id and an unfriended user all get 404 for a profile; ten concurrent adds with the same code make one friendship and one `friendship.created`; adding your own code is 409; a rotated code is 404; social handles never produce a non-`https` URL and `javascript:` is rejected; inviting a non-friend or from an activity you are not in sends nothing; accepting a full activity returns `CAPACITY_FULL` and leaves the invite pending; invites expire when the activity ends.
- With two dev users: A shows the QR, B opens the `/add/` link (or scans it with a phone camera), both see each other in Friends; A hosts an activity and invites B; B accepts and is in the activity.
- `npm run check` passes.

## Open questions for the owner

1. **QR library (new dependency).** Generating a QR needs one small library, for example `qrcode` (pure JS, no native code). Scanning needs none. Needs a yes and its own commit touching `package.json` and the lockfile.
2. **Contact visibility default.** Plan: friends see phone, email and socials; code holders see name, photo and pronouns only. Alternative: per-field "show to friends" toggles (more UI, same storage).
3. **Profile photos.** Plan: Google picture only. Custom uploads need storage (Vercel Blob or similar), a new service and dependency; listed as stretch.

## Stretch

Custom photo upload; per-field visibility toggles; block (unfriend plus refusing that person's future adds); "N friends here" on activity rows (needs a friends lookup from the activities panel via a new `GET /api/friends/ids`); share a friend's contact as a vCard; a reward rule for a first activity joined through an invite.
