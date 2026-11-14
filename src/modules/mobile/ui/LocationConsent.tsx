"use client";

import { useStore } from "@/shared/ui/store";
import {
  acceptDisclosure,
  controllerStore,
  declineDisclosure,
  fixProblem,
  openBackgroundSettings,
  setSharing,
  skipBackgroundStep,
} from "./controller";

const sheet = "fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center";
const card = "w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 text-neutral-900 shadow-xl";
const primary = "w-full rounded-xl bg-neutral-900 px-4 py-3 font-medium text-white";
const secondary = "w-full rounded-xl bg-neutral-100 px-4 py-3 font-medium text-neutral-800";

/**
 * The disclosure shown before Android's first location prompt, the follow-up about "Allow all
 * the time", and the small status pill that is the always-visible way to turn sharing off.
 */
export function LocationConsent() {
  const disclosureOpen = useStore(controllerStore, (s) => s.disclosureOpen);
  const backgroundOpen = useStore(controllerStore, (s) => s.backgroundOpen);
  const sharing = useStore(controllerStore, (s) => s.sharing);
  const mode = useStore(controllerStore, (s) => s.mode);
  const problem = useStore(controllerStore, (s) => s.problem);

  return (
    <>
      {disclosureOpen ? (
        <div className={sheet} role="dialog" aria-modal="true" aria-labelledby="loc-title">
          <div className={card}>
            <h2 id="loc-title" className="text-lg font-semibold">
              Share your location with ZooMap?
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700">
              <li>
                <strong>What is collected:</strong> your phone&apos;s location, reduced on our server to an approximate
                area of campus and the building you are near. We do not keep your exact position or a history of where
                you have been.
              </li>
              <li>
                <strong>Why:</strong> to add you to the crowd heatmap, and to count your time at an activity you have
                joined so you earn points.
              </li>
              <li>
                <strong>How to turn it off:</strong> use the &quot;Sharing location&quot; button at the top of the map,
                or switch sharing off in the app. Android also lets you revoke location in Settings.
              </li>
            </ul>
            <p className="text-xs text-neutral-500">
              Next, Android asks for permission. While sharing is on, a notification stays visible so you always know.
            </p>
            <div className="space-y-2">
              <button type="button" className={primary} onClick={() => void acceptDisclosure()}>
                Continue
              </button>
              <button type="button" className={secondary} onClick={() => void declineDisclosure()}>
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {backgroundOpen ? (
        <div className={sheet} role="dialog" aria-modal="true" aria-labelledby="bg-title">
          <div className={card}>
            <h2 id="bg-title" className="text-lg font-semibold">
              Keep sharing with the screen off
            </h2>
            <p className="text-sm text-neutral-700">
              So your time at an activity keeps counting when your phone is in your pocket, open ZooMap&apos;s settings
              and set <strong>Permissions &gt; Location</strong> to <strong>Allow all the time</strong>. Also allow{" "}
              <strong>Notifications</strong> so you can see when sharing is on.
            </p>
            <p className="text-xs text-neutral-500">Android does not let an app grant this itself. You can skip this and change it later.</p>
            <div className="space-y-2">
              <button type="button" className={primary} onClick={() => void openBackgroundSettings()}>
                Open settings
              </button>
              <button type="button" className={secondary} onClick={() => void skipBackgroundStep()}>
                Skip
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mode === "sharing" || problem ? (
        <div className="fixed right-3 top-[calc(env(safe-area-inset-top)+3.75rem)] z-40 flex max-w-[16rem] items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs text-neutral-900 shadow-md">
          {problem === "permission-denied" ? (
            <>
              <span>Location is blocked.</span>
              <button type="button" className="font-semibold underline" onClick={() => void fixProblem()}>
                Settings
              </button>
            </>
          ) : problem === "needs-permission" ? (
            <>
              <span>Location needs permission.</span>
              <button type="button" className="font-semibold underline" onClick={() => void fixProblem()}>
                Allow
              </button>
            </>
          ) : problem === "no-token" || problem === "error" ? (
            <>
              <span>Sharing paused.</span>
              <button type="button" className="font-semibold underline" onClick={() => void fixProblem()}>
                Retry
              </button>
            </>
          ) : (
            <>
              <span aria-hidden className="size-2 rounded-full bg-red-600" />
              <span>Sharing location</span>
              <button
                type="button"
                className="font-semibold underline"
                disabled={sharing === false}
                onClick={() => void setSharing(false)}
              >
                Turn off
              </button>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
