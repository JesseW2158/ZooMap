# Stream: mobile (server half)

Branch `mobile`. Brief: `docs/plan/ws-mobile.md`. This file covers the server side (auth handoff, device tokens). The native Android half is a separate worktree and is not described here.

## Status (2026-11-14)

- [x] Sign-in handoff: `/auth/mobile/start`, `/auth/mobile/done`, `/auth/mobile/finish`, `handoff` Credentials provider. Reusing a code fails (tested).
- [x] Device tokens: `createDeviceToken`, `resolveDeviceToken`, deleted on sign-out. Stored value is a hash (tested). A bearer token authenticates `requireUser`, so `POST /api/presence/ping` accepts it; an unknown one gets 401.
- [x] Exercised end to end against `next start` (production mode, so the provider is proven to be registered without DEV_AUTH): start, done, finish with cookie jar, reuse, wrong verifier, bearer ping, mint-by-token 403, sign-out then bearer 401.
- [ ] Not verified: the real Google sign-in in a Custom Tab, Chrome's handling of the `zoomap://` page, and anything on a phone.

## Endpoints

All three are outside `/api` (no `API_ROUTES` entry needed). There is no `proxy.ts`/`middleware.ts`, so all are reachable signed out.

1. `GET /auth/mobile/start?challenge=C` (page). Opened in a Custom Tab. `C` = base64url(SHA-256(verifier)), no padding, exactly 43 chars; anything else renders an error message and no sign-in buttons. Already signed in: redirects to step 2 (a GET, which mints nothing). Otherwise shows "Continue with Google" (plus the seed-user buttons when `DEV_AUTH`), each with `redirectTo=/auth/mobile/done?challenge=C`.
2. `/auth/mobile/done?challenge=C` (route handler, `no-store`). Invalid challenge: 400. **GET never mints a code.** Signed out: 307 to `start`. Signed in: a confirmation page, "Open the ZooMap app signed in as <email>?", with a Continue button that POSTs to the same URL. Only the **POST** (same-origin only: `Sec-Fetch-Site: same-origin`, or without that header an `Origin` naming this host; else 403) makes the code (32 random bytes, base64url) and answers an HTML page that runs `location.replace("zoomap://auth?code=...")` and shows a "Return to ZooMap" link to the same URL. The pages use `Referrer-Policy: same-origin`, because `no-referrer` makes browsers send `Origin: null` on the form POST.
3. `GET /auth/mobile/finish?code=&verifier=` (route handler, `no-store`), loaded in the WebView. **It refuses unless `Sec-Fetch-Site` is exactly `same-origin`** (redirect to `/signin?error=Handoff`, checked before the code is touched, so a refused request does not spend it). Calls Auth.js `signIn("handoff", { redirect: false })` from the handler, which sets the session cookie, then 307 to `/`. Any failure: 307 to `/signin?error=Handoff` (the sign-in page shows its generic message; `src/app/signin/page.tsx` is not ours to edit).
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

## Security notes

- Why `done` needs a click: without it, a link to `/auth/mobile/start?challenge=<attacker's C>` would let a malicious app registered for `zoomap://` get a code for a signed-in victim's browser session, bound to a challenge the attacker holds the verifier for. Now a person has to tap Continue on a page that names their account.
- **Residual risk**: a victim who taps Continue on a phishing link while a malicious `zoomap://` app is installed. The real fix is Android App Links (a verified https return link plus `assetlinks.json`), deferred.
- **Native side must navigate to `finish` from a same-origin page**: `window.location.assign("/auth/mobile/finish?...")` from a page of the site loaded in the WebView, never by loading the URL fresh from native code (`webView.loadUrl`, Capacitor `server` navigation), because that request carries `Sec-Fetch-Site: none` and is refused.
- `finish` is a GET that signs in. The `Sec-Fetch-Site: same-origin` check closes the login-CSRF path (an attacker's page loading its own code and verifier into a victim's browser): a cross-site navigation carries `cross-site`. A Chrome-only guarantee, which is what the WebView is. A challenge cookie would add nothing: an attacker's link goes through `/start` and would set it itself.
- **A device token is a narrow credential.** `requireUser`/`getAuthUser` accept it only for `POST /api/presence/ping` (`DEVICE_TOKEN_ROUTES` in `src/modules/auth/session.ts`, one list; the pathname is exact, the query string ignored). On every other route a bearer token is the same as no credentials (401), so a token lifted from a phone cannot redeem, host, or touch friends. Session cookies work everywhere. `POST /api/mobile/device-token` also still refuses device tokens on its own `via` check.
- **Idle expiry**: a token not used for 30 days (`DEVICE_TOKEN_IDLE_MS`; a never-used token counts from `createdAt`) is deleted on its next use and refused. The check is inside the same `findOneAndUpdate` that refreshes `lastUsedAt`, so a stale token is never refreshed on its way out. The app already fetches a new token after a 401.
- Other streams: do not rely on a device token for any new route. If one must accept it, the contract and `DEVICE_TOKEN_ROUTES` change together.
