"use client";

import { useState } from "react";
import { useStore } from "@/shared/ui/store";
import { controllerStore, fixProblem, type Problem } from "./controller";

const MESSAGES: Record<Exclude<Problem, null>, { text: string; action: string }> = {
  "permission-denied": { text: "Location is blocked, so your location is not being shared.", action: "Open settings" },
  "needs-permission": { text: "Minute Map needs location permission to share your location.", action: "Allow" },
  "no-token": { text: "Location sharing is paused.", action: "Retry" },
  error: { text: "Location sharing is paused.", action: "Retry" },
};

/**
 * Location problems, as a banner at the top of the map sheet ("Map update"). Shown only in the
 * Android app and only while there is a problem: the controller is filled in by the native bridge
 * alone, so in a browser `problem` stays null and this renders nothing. The fix runs the same
 * steps the old map pill did (Settings for a blocked permission, the prompt, or a retry).
 */
export function LocationStatus() {
  const problem = useStore(controllerStore, (s) => s.problem);
  const [busy, setBusy] = useState(false);
  if (!problem) return null;
  const { text, action } = MESSAGES[problem];

  const fix = async () => {
    setBusy(true);
    try {
      await fixProblem();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" className="mb-3 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <span aria-hidden className="mt-0.5 font-bold">
        !
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p>{text}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void fix()}
          className="rounded-lg bg-amber-200 px-3 py-1.5 font-semibold text-amber-950 disabled:opacity-60"
        >
          {busy ? "…" : action}
        </button>
      </div>
    </div>
  );
}
