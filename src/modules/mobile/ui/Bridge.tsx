"use client";

import { useEffect } from "react";
import { isNativeShell, registerLocationSource, setExternalAuthHandler, startLocation } from "@/shared/platform";
import { LocationConsent } from "./LocationConsent";
import { loadConsent, onTrackerFix, refreshSharing, requestLocal, startIfAlreadyAllowed } from "./controller";
import { ensureDeviceToken } from "./device-token";
import { installReturnListener } from "./handoff";
import { getTracker } from "./tracking";

/** How often the shell re-reads the sharing setting while the app is in the foreground. */
const SHARING_POLL_MS = 20_000;
/** The map's location dot does not need a fix every second. */
const MAP_PUSH_EVERY_MS = 5_000;

/** `/api/...` and other site paths become absolute so the Custom Tab (another browser) can open them. */
function absolute(url: string): string {
  return new URL(url, window.location.origin).toString();
}

/**
 * Mounted once, headless (it renders only the disclosure dialog and the sharing pill, and only
 * in the Android shell). In a browser it does nothing. In the shell it
 *  - routes `openExternalAuth` (calendar connection) to a Custom Tab; that flow ends on a web
 *    page in the tab, so it returns to the app when the user closes the tab, and the app then
 *    reloads so the new connection shows up;
 *  - makes sure there is a device token for background pings;
 *  - registers the native location source for `useUserLocation`;
 *  - keeps the tracker in step with the user's sharing setting;
 *  - listens for the sign-in return link (harmless here, needed if the app is relaunched by it).
 */
export function MobileBridge() {
  useEffect(() => {
    if (!isNativeShell()) return;
    const cleanups: Array<() => void> = [];
    let disposed = false;

    installReturnListener();

    // (a) calendar and other OAuth: system browser instead of the WebView
    let externalTabOpen = false;
    cleanups.push(
      setExternalAuthHandler((url) => {
        externalTabOpen = true;
        void import("@capacitor/browser")
          .then(({ Browser }) => Browser.open({ url: absolute(url) }))
          .catch((cause) => {
            externalTabOpen = false;
            console.warn("[zoomap-native] could not open the browser", cause);
            window.location.assign(url);
          });
      }),
    );
    void import("@capacitor/browser").then(async ({ Browser }) => {
      const handle = await Browser.addListener("browserFinished", () => {
        if (!externalTabOpen) return;
        externalTabOpen = false;
        window.location.reload();
      });
      if (disposed) void handle.remove();
      else cleanups.push(() => void handle.remove());
    });

    // (c) the native location source behind `startLocation()`
    cleanups.push(
      registerLocationSource((push) => {
        let lastPush = 0;
        const off = onTrackerFix((fix) => {
          if (fix.time - lastPush < MAP_PUSH_EVERY_MS && lastPush !== 0) return;
          lastPush = fix.time;
          push({ lat: fix.lat, lng: fix.lng, ...(fix.accuracyM !== undefined ? { accuracyM: fix.accuracyM } : {}) });
        });
        const release = requestLocal();
        return () => {
          off();
          release();
        };
      }),
    );

    // (b) device token, (d) sharing state, then start tracking if it is on and already allowed
    void (async () => {
      await getTracker().clearOrphans();
      await loadConsent();
      await Promise.all([ensureDeviceToken(), refreshSharing()]);
      if (!disposed && (await startIfAlreadyAllowed())) startLocation();
    })();

    // keep in step while the app is in the foreground (the user may change sharing in a panel)
    const poll = setInterval(() => {
      if (!document.hidden) void refreshSharing();
    }, SHARING_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) {
        void ensureDeviceToken();
        void refreshSharing();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    void import("@capacitor/app").then(async ({ App }) => {
      const handle = await App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) onVisible();
      });
      if (disposed) void handle.remove();
      else cleanups.push(() => void handle.remove());
    });
    cleanups.push(() => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    });

    // A full page load discards this JavaScript but not the plugin's watcher, so a page that is
    // going away asks for its watcher to be removed (best effort), and the next page removes
    // whatever was left (clearOrphans, above).
    const onPageHide = () => void getTracker().setMode("off");
    window.addEventListener("pagehide", onPageHide);
    cleanups.push(() => window.removeEventListener("pagehide", onPageHide));

    return () => {
      disposed = true;
      for (const c of cleanups) c();
    };
  }, []);

  return <LocationConsent />;
}
