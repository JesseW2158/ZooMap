# Workstream: mobile shell

An Android app that wraps the deployed site and reports location in the background. A person with a phone must test this stream; plan for that from the first hour.

**Owns:** `android/**`, `capacitor.config.ts`, `src/modules/mobile/**`, `src/modules/auth/**` (from the end of Phase 0), `src/app/auth/mobile/**`, `src/app/api/mobile/**`.
**Provides:** the installable app, `resolveDeviceToken`, the native location source, `openExternalAuth` in the shell.
**Consumes:** `POST /api/presence/ping` (a stub is enough to start).
**May add dependencies:** one background-location plugin and the Capacitor plugins it needs (`@capacitor/app`, `@capacitor/browser`, `@capacitor/preferences`), as a commit touching only `package.json` and the lockfile, rebased onto `main` at once.

## Shape

The app is a Capacitor WebView whose `server.url` is the site: `NEXT_PUBLIC_APP_URL` for release builds, `http://localhost:3000` with `adb reverse tcp:3000 tcp:3000` during development. All screens are the web app. Native code exists for three things only.

### 1. Sign-in handoff

Google refuses OAuth inside an embedded WebView, so sign-in happens in the system browser:

1. In the shell, the sign-in button opens `/auth/mobile/start` in a Custom Tab, which runs the normal Google sign-in there.
2. It lands on `/auth/mobile/done`, which creates a one-time code (random, stored hashed in `handoff_codes`, 60-second expiry) and redirects to `zoomap://auth?code=...`.
3. The app receives the link, closes the tab and loads `/auth/mobile/finish?code=...` in the WebView, which signs in through a `handoff` credentials provider. The provider deletes the code as it reads it, so a code works once.

Route `openExternalAuth` through the same Custom Tab and return link, so the schedule stream's calendar connection works in the shell.

### 2. Background location

- Default plugin: `@capacitor-community/background-geolocation`; if it fails on Capacitor 8, `@capgo/background-geolocation`. Read the README of whichever you use for the manifest entries and the foreground-service notification.
- Before the system prompt, show a plain screen: what is collected (an approximate area, no history), why (the heatmap and activity time), and how to turn it off. Request "while using", then "all the time". Start tracking only while the user's sharing setting is on.
- **Android throttles WebView network requests about five minutes after the app is backgrounded** (the plugin README says so and recommends native HTTP). Send pings with Capacitor's native HTTP, authenticated by a device token.
- **Ping on a clock, not on movement.** Verified time needs a ping at least every 300 seconds, and a student sitting in a library does not move. Send one every 60 to 120 seconds while tracking, resending the last fix when there is no new one, with `distanceFilter` 0. The README does not say whether fixes arrive while the phone is still, so prove it on a phone lying on a table before building anything else in this stream.
- Register the native source with `useUserLocation` so the web pinger stays off in the shell.

### 3. Device token

`POST /api/mobile/device-token` (cookie auth) returns a random 32-byte token once and stores only its SHA-256 in `device_tokens`. The app keeps it in Capacitor Preferences. `resolveDeviceToken(req)` reads `Authorization: Bearer`, looks up the hash and updates `lastUsedAt`. Signing out deletes the token.

## Done when

- A debug APK installs and opens the site. *(Human, on a phone.)*
- Sign-in completes through the Custom Tab and returns to the app signed in; reusing a handoff code fails (tested).
- With the phone **lying still**, the app backgrounded and the screen off for 15 minutes, the `presence` document's `updatedAt` never goes more than 150 seconds without advancing, and a joined activity's verified minutes grow by about 15. *(Human.)*
- Turning sharing off stops the foreground service and its notification.
- Device-token tests: a valid token authenticates the ping; an unknown or deleted one gets 401; the stored value is a hash.
- `docs/plan/mobile-build.md` records the exact build and install commands that worked.
- `npm run check` passes.

## Stretch

A release build signed for sharing; a notification when points are earned.
