import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The Android shell is a WebView on the deployed site. `server.url` is the site:
 *   dev      http://localhost:3000 with `adb reverse tcp:3000 tcp:3000` (the default below)
 *   release  CAP_SERVER_URL=https://<your-vercel-domain> npx cap sync android
 * `mobile-www/` is a placeholder: Capacitor requires a webDir, but nothing is served from it.
 * See docs/plan/mobile-build.md.
 */
const url = process.env.CAP_SERVER_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const config: CapacitorConfig = {
  appId: "app.zoomap",
  appName: "Minute Map",
  webDir: "mobile-www",
  server: {
    url,
    cleartext: url.startsWith("http://"),
  },
  android: {
    // Required by @capacitor-community/background-geolocation: without it location updates
    // stop reaching the WebView about five minutes after the app is backgrounded.
    useLegacyBridge: true,
  },
  plugins: {
    // The default ("css") writes --safe-area-inset-* onto <html> before React hydrates, which
    // causes a hydration mismatch. The app uses env(safe-area-inset-*), which "native" keeps correct.
    SystemBars: { insetsHandling: "native" },
  },
};

export default config;
