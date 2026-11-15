# Building and testing the Android shell

The app in `android/` is a Capacitor WebView on the deployed site (`server.url` in `capacitor.config.ts`) plus native code for sign-in handoff and background location. All screens are the web app.

**Status of these instructions.** They were written on a machine with JDK 21 and Node but **no Android SDK, no `adb` and no phone**. What was run there: `npx cap add android`, `npx cap sync android` (default URL and with `CAP_SERVER_URL` set), `npm run check` with `SKIP_DB_TESTS=1`, `npm run build`, and the unit tests. Everything marked **NOT RUN** below needs the SDK or a device and has never been executed. Nothing here has been seen working on a phone. When you run a step, edit this file to say so.

## One-time setup (NOT RUN)

1. Install Android Studio (it brings the SDK, platform tools and a JDK). Capacitor 8 needs JDK 21 and a recent SDK: `compileSdk`/`targetSdk` 36, `minSdk` 24 (`android/variables.gradle`). Accept the SDK licences when Studio asks.
2. Put `platform-tools` on `PATH` so `adb` works, and enable Developer options and USB debugging on the phone.
3. `npm ci` at the repo root. The plugins are already in `package.json`: `@capacitor/app`, `@capacitor/browser`, `@capacitor/preferences`, `@capacitor-community/background-geolocation` (1.3.1; its README has "Add support for Capacitor v8" in the changelog and its peer range accepts it).
4. Google sign-in only works through the Custom Tab (the system browser), so the OAuth client needs the same redirect URI the website uses. In dev that is `http://localhost:3000/api/auth/callback/google`, which works from the phone's browser too because of `adb reverse` below.

## (a) Dev: the phone shows your local `npm run dev` (NOT RUN)

```sh
npm run dev                         # site on :3000
adb devices                         # the phone must be listed as "device"
adb reverse tcp:3000 tcp:3000       # phone's localhost:3000 -> this machine
npx cap sync android                # writes android/app/src/main/assets/capacitor.config.json
npx cap run android                 # builds, installs and launches (choose the device)
```

Or open the project in Android Studio (`npx cap open android`), pick the phone and press Run.

Notes:
- `adb reverse` is lost when the cable is unplugged or `adb` restarts. Run it again.
- `npx cap sync android` is needed after changing `capacitor.config.ts` or plugins, not after changing the website: the WebView loads the site live.
- The dev server's `DEV_AUTH=1` buttons appear inside the Custom Tab (on `/auth/mobile/start`), not in the app.

## (b) A debug APK to hand to someone (NOT RUN)

A debug APK points at whatever URL was synced into it, so sync the URL you want first (see (c); for a local demo over `adb reverse` the default is right).

```sh
npx cap sync android
cd android
./gradlew assembleDebug             # on Windows: gradlew.bat assembleDebug
# output: android/app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The build needs the SDK location: Android Studio writes `android/local.properties` (`sdk.dir=...`, gitignored) the first time it opens the project, or set `ANDROID_HOME`.

If Gradle fails on the background-geolocation module (its own `build.gradle` still names AGP 8.0.0 in a `buildscript` block), that is the first suspect: the plugin was published for Capacitor 8 but has not been compiled by us. Report the error text.

## (c) A build that loads the deployed site (NOT RUN, except the sync)

```sh
CAP_SERVER_URL=https://<your-vercel-domain> npx cap sync android     # POSIX shell
$env:CAP_SERVER_URL="https://<your-vercel-domain>"; npx cap sync android   # PowerShell
cd android && ./gradlew assembleDebug
```

`CAP_SERVER_URL` falls back to `NEXT_PUBLIC_APP_URL` (when it is set in the shell, `.env.local` is not read by the Capacitor CLI) and then `http://localhost:3000`. `cleartext` is set only when the URL is `http://`. Ran here: with `CAP_SERVER_URL=https://zoomap.example` the generated `capacitor.config.json` has that URL and `"cleartext": false`.

The Google OAuth client needs the deployed callback URL, and `AUTH_URL`/`NEXT_PUBLIC_APP_URL` on Vercel must be the same origin.

## What each piece does (for debugging)

- **Sign-in.** `/signin` in the shell shows one button. It stores a verifier in Preferences, opens `/auth/mobile/start?challenge=...` in a Custom Tab, Google sign-in runs there, the tab ends at `zoomap://auth?code=...`, Android opens the app, and the app calls `window.location.assign('/auth/mobile/finish?code=...&verifier=...')` from the site's own page (the server requires `Sec-Fetch-Site: same-origin`, so this must never be loaded from native code). If the app was killed while the tab was open, `App.getLaunchUrl()` delivers the link after the site page loads.
- **Calendar connection** (`openExternalAuth`) opens in a Custom Tab too. That flow ends on a web page inside the tab and has no link back to the app, so it returns when the user closes the tab; the app then reloads so the new connection appears.
- **Device token.** `POST /api/mobile/device-token` (cookie) once, kept in Preferences, sent as `Authorization: Bearer` by background pings (native HTTP, `CapacitorHttp` per request; the global fetch patch is off). The server accepts it only on `POST /api/presence/ping` (any other route answers 401) and deletes it after 30 days without use. A 401 deletes it and the next foreground fetches a new one.
- **Location.** One watcher with `distanceFilter: 0`. Pings every 60 s from the location callback, plus a 30 s check that resends the last fix when 90 s pass without a ping, so the longest gap is about 120 s. A 403 or sharing turned off removes the watcher, which ends the foreground service and its notification. Console lines start with `[zoomap-native]`.

## Test steps for a person with a phone (NOT RUN)

**Install and sign in**
1. Run (a) or install the APK. The app should open on the sign-in screen with one "Continue with Google" button.
2. Tap it. The browser opens, you sign in with a UMass Google account (or a `DEV_AUTH` button), and the tab shows an **"Open the ZooMap app as <email>?"** confirmation button. Tap it. The tab closes and the app loads the map signed in.
3. Kill the app from recents while the Custom Tab is open, finish sign-in in the tab, tap the confirmation button: the app should start and end up signed in (cold-start path).
4. Sign out and in again; reusing an old `zoomap://auth?code=...` link must not sign in.

**Sharing**
5. Join an activity, tap "Turn on sharing". The disclosure dialog appears first (what, why, how to turn off). Tap Continue: Android asks for location, then a screen explains "Allow all the time" and opens Settings. Set Location to "Allow all the time" and allow Notifications.
6. A notification "ZooMap is sharing your location" stays up, and a "Sharing location / Turn off" pill sits at the top right. Tap Turn off: the notification must disappear within a few seconds.
7. Sign out while sharing: the notification must disappear as well.

**The 15-minute still test (the one that matters)**
8. Turn sharing on, join an activity, then put the phone **flat on a table**, press the power button (screen off) and leave it for **15 minutes**. Do not touch it.
9. In MongoDB, watch the `presence` document for the user: `updatedAt` must never be more than **150 s** older than now at any point. For example, in mongosh: `while(true){ printjson(db.presence.findOne({_id:"<user id>"},{updatedAt:1})); sleep(10000) }` (the presence document's `_id` is the user id; see `PresenceDoc` in `src/shared/contracts/documents.ts`).
10. After 15 minutes the activity's verified minutes should have grown by about 15.

**First-hour check: do fixes arrive while the phone is still, and does JS keep running with the screen off?**
The plugin README does not say. Before trusting anything else, do this once:
1. Connect the phone by USB, open `chrome://inspect/#devices` on the computer and inspect the ZooMap WebView. Console lines look like `[zoomap-native] fix 2026-11-14T16:02:03.000Z acc=9 m age=0 s` (one line per 5 s at most).
2. Lay the phone still, screen on, 2 minutes: lines should keep coming.
3. Press the power button, wait 10 minutes, wake the phone: look at the timestamps. A gap means either no fixes while still or WebView JavaScript was paused with the screen off. `ping (fix)` and `ping (fallback)` lines show which trigger sent each ping; `ping result: ok` shows the server answered.
4. If there are gaps: say so in `.10x/streams/mobile-native.md`. The fix would be native-side (the service sending the ping itself), which this implementation does not do.

Also useful: `adb logcat | grep -i -E "zoomap|Capacitor|BackgroundGeolocation"`.

## Known limits

- Battery: the plugin requests a high-accuracy fix every second (`interval 1000`, `PRIORITY_HIGH_ACCURACY`; not configurable through the plugin). The app only sends one ping a minute, but the GPS stays on while sharing.
- The plugin has no way to ask for `ACCESS_BACKGROUND_LOCATION` or `POST_NOTIFICATIONS`. The app explains and opens Settings; it cannot tell whether the user granted them. A location foreground service started while the app is visible should keep working in the background without "all the time", but that is untested.
- iPhone is browser-only.
