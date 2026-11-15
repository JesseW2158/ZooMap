"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { isNativeShell } from "@/shared/platform";
import { installReturnListener, startHandoff } from "./handoff";
import { getTracker } from "./tracking";

const subscribe = () => () => {};

/**
 * Wraps the sign-in forms. In a browser it renders them unchanged. In the Android shell it
 * replaces them with one button that signs in through a Custom Tab (Google refuses OAuth in a
 * WebView); dev sign-in then happens inside that tab, at /auth/mobile/start.
 */
export function ShellSignIn({ children }: { children: ReactNode }) {
  // false on the server and during hydration, so the browser markup is the server markup
  const inShell = useSyncExternalStore(subscribe, isNativeShell, () => false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!inShell) return;
    installReturnListener();
    // signing out leaves the plugin's watcher (and its notification) behind; remove it here
    void getTracker().clearOrphans();
  }, [inShell]);

  if (!inShell) return <>{children}</>;

  const onClick = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await startHandoff();
    } catch (cause) {
      console.warn("[zoomap-native] could not open the sign-in tab", cause);
      setFailed(true);
    } finally {
      // the tab covers the app; when the user comes back without finishing, the button works again
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="zm-press w-full rounded-2xl bg-white px-4 py-3.5 font-semibold text-ink shadow-lg shadow-black/20 hover:bg-ivory disabled:opacity-60"
      >
        Continue with Google
      </button>
      {/* the sign-in page is dark navy, so the hint is light */}
      <p className="text-center text-xs text-ivory/70">Sign-in opens in your browser, then brings you back here.</p>
      {failed ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Could not open the browser. Try again.
        </p>
      ) : null}
    </div>
  );
}
