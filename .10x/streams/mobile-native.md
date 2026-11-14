# Stream: mobile shell (native/client half)

**Branch:** worktree of `mobile`. Server half (`/auth/mobile/*`, device tokens, ping) is a separate session.
**Status:** code written; unit tests, typecheck, lint, `npm run build` and `npx cap sync android` pass. **Nothing has run on Android**: this machine has no SDK, no `adb`, no phone, and no Gradle build was attempted.

## Decisions

- Plugin: `@capacitor-community/background-geolocation@1.3.1` (peer `@capacitor/core >=3.0.0`; changelog says Capacitor 8 support; published 2026-10-22). `@capgo/background-geolocation` (peer `>=8.0.0`) was not needed. Pinned: app 8.1.2, browser 8.0.5, preferences 8.0.1.
- `android.useLegacyBridge: true` in `capacitor.config.ts`: the plugin README requires it, otherwise updates stop reaching the WebView about five minutes after backgrounding.
- Pings use `CapacitorHttp` per request. The global fetch patch is off.
- Ping clock: at most one per 60 s from the location callback; a 30 s timer resends the last fix when 90 s pass without a ping (a bare 90 s interval can leave up to 180 s, over the 150 s budget). A resent fix older than 10 min is dropped.
- Tracker modes: `off`, `local` (foreground watcher, no notification, only the map dot), `sharing` (background notification plus pings). Leaving `sharing` removes the watcher.
- The plugin keeps its watcher after a full page load, orphaned (callback ids restart per page, the service and its notification live on). Watcher ids are stored in Preferences and removed by the next page (`clearOrphans`, called by `MobileBridge` and `ShellSignIn`); the page also asks for removal on `pagehide`.
- `src/app/signin/page.tsx` imports `@/modules/mobile/ui/ShellSignIn` with an `eslint-disable-next-line no-restricted-imports`: the deep-import rule exempts only `registry.ts`, and the module index is server code.
- Handoff: verifier kept in Preferences before the tab opens; the last finished code is remembered because `App.getLaunchUrl()` keeps returning the cold-start link for the life of the process.

## Not verified (all on-device)

Debug APK builds (Gradle with the plugin's own `buildscript` AGP 8.0.0 block is the first suspect); site loads in the WebView; Custom Tab sign-in and return link, cold-start path; permission prompts and the disclosure flow; foreground service and notification appear and disappear; fixes arrive while the phone lies still; WebView JavaScript keeps running (timers, `CapacitorHttp`) with the screen off; pings keep `presence.updatedAt` within 150 s over 15 minutes; Android 13+ notification visibility without `POST_NOTIFICATIONS`.

## Risks

1. **JS with the screen off.** Pings are sent from WebView JavaScript. Capacitor does not pause the WebView on background, and the foreground service keeps the process alive, but Chromium may throttle or freeze timers and message delivery, and the plugin README says nothing about it. If the first-hour check shows gaps, the fix is native-side pinging from the service (Java), which is not built.
2. **Stationary fixes.** The plugin README does not say whether fixes arrive when the phone does not move. Its source asks the fused provider for `PRIORITY_HIGH_ACCURACY` every 1000 ms with `setSmallestDisplacement(0)`, which normally delivers regardless of movement. Costs battery, and is not configurable.
3. `ACCESS_BACKGROUND_LOCATION` and `POST_NOTIFICATIONS` cannot be requested through the plugin; the app opens Settings and cannot see the result. A foreground service started while the app is visible should keep location access in the background without "all the time" (untested).
4. The Google client must allow the dev/prod callback URL; the Custom Tab shows a confirmation button before returning (server side).
