# Stream: mobile (server half)

Branch `mobile`. Brief: `docs/plan/ws-mobile.md`. This file covers the server side (auth handoff, device tokens). The native Android half is a separate worktree and is not described here.

## Status (2026-11-14)

- [x] Sign-in handoff: `/auth/mobile/start`, `/auth/mobile/done`, `/auth/mobile/finish`, `handoff` Credentials provider. Reusing a code fails (tested).
- [x] Device tokens: `createDeviceToken`, `resolveDeviceToken`, deleted on sign-out. Stored value is a hash (tested). A bearer token authenticates `requireUser`, so `POST /api/presence/ping` accepts it; an unknown one gets 401.
- [x] Exercised end to end against `next start` (production mode, so the provider is proven to be registered without DEV_AUTH): start, done, finish with cookie jar, reuse, wrong verifier, bearer ping, mint-by-token 403, sign-out then bearer 401.
- [ ] Not verified: the real Google sign-in in a Custom Tab, Chrome's handling of the `zoomap://` page, and anything on a phone.

## Endpoints

All three are outside `/api` (no `API_ROUTES` entry needed). There is no `proxy.ts`/`middleware.ts`, so all are reachable signed out.

1. `GET /auth/mobile/start?challenge=C` (page). Opened in a Custom Tab. `C` = base64url(SHA-256(verifier)), no padding, exactly 43 chars; anything else renders an error message and no sign-in buttons. Already signed in: redirects to step 2. Otherwise shows "Continue with Google" (plus the seed-user buttons when `DEV_AUTH`), each with `redirectTo=/auth/mobile/done?challenge=C`.
2. `GET /auth/mobile/done?challenge=C` (route handler, `no-store`). No session: 307 to `start`. Invalid challenge: 400. Otherwise makes a code (32 random bytes, base64url) and answers an HTML page that runs `location.replace("zoomap://auth?code=...")` and shows a "Return to ZooMap" link to the same URL.
3. `GET /auth/mobile/finish?code=&verifier=` (route handler, `no-store`), loaded in the WebView. Calls Auth.js `signIn("handoff", { redirect: false })` from the handler, which sets the session cookie, then 307 to `/`. Any failure: 307 to `/signin?error=Handoff` (the sign-in page shows its generic message; `src/app/signin/page.tsx` is not ours to edit).
4. `POST /api/mobile/device-token`: cookie session only (a device token cannot mint another, 403). Returns `{ token }` once.

## Verifier scheme

- The app makes a random `verifier`: RFC 7636 characters, **43 to 128 long** (use 32 random bytes as base64url = 43 chars). The server rejects anything else.
- `challenge = base64url(SHA-256(verifier))`. The challenge is stored with the code; the verifier is only ever sent to `finish`.
- Code row (`handoff_codes`): `_id` = base64url SHA-256 of the code, `userId`, `challenge`, `expiresAt` (now + 60 s). `challenge` is a contract addition (`HandoffCodeDoc`), its own commit.
- `authorize` of the `handoff` provider does `findOneAndDelete({ _id: hash(code), expiresAt: { $gt: now } })`, so a code works once, even when the verifier is wrong. Then it compares SHA-256(verifier) with the stored challenge in constant time and loads the existing user. It never creates a user. The `jwt` callback keeps that user's id (`token.uid`); `decideSignIn` applies the allowed-domain rule to `handoff` too.
- Because the code travels through a custom-scheme link that another app could register, the code alone signs nobody in: the verifier never leaves the app.

## Device tokens

- 32 random bytes, base64url (43 chars). `device_tokens` stores `tokenHash` = SHA-256 hex, `userId`, `createdAt`, `lastUsedAt`.
- `resolveDeviceToken(req)` accepts `Authorization: Bearer <t>` (scheme case-insensitive, whitespace trimmed), updates `lastUsedAt`, and returns `{ ..., via: "device" }`. It returns null (never throws) for a missing, malformed, unknown or deleted token, and when the user no longer has an allowed email domain.
- Auth.js `events.signOut` deletes all `device_tokens` of the signing-out user (`token.uid`). Tokens never expire otherwise.

## What other streams need to know

- **density**: the Android shell pings with a Bearer token, so `POST /api/presence/ping` must go through `requireUser(req)` (it already does in the stub) and must treat `user.via === "device"` as a normal user. The **web pinger must stay off when `isNativeShell()` is true / the location source is "native"**, or the same phone reports twice and the browser (throttled in the background) fights the native source.
- **native half**: the verifier must be 43 to 128 chars of `[A-Za-z0-9._~-]`; `finish` URL-encodes nothing special, but pass both values URL-encoded anyway. After a sign-out in the WebView the stored device token is dead; request a new one after the next sign-in.
- Behind a non-Vercel host, Auth.js needs `AUTH_TRUST_HOST=true` (found while running `next start` locally); Vercel sets it.
- `src/app/api/routes.test.ts` now mocks `@/modules/mobile` (the real `createDeviceToken` writes to the database); the real behaviour is in `src/modules/auth/device-token.db.test.ts`.
- `finish` is a GET that signs in, so it is login-CSRF-able in principle (a page could load an attacker's own code+verifier into a victim's browser). It needs both secrets of an attacker's own session and gains nothing against the victim's data; accepted for the hackathon.
