"use client";

import { ActivityList, ActivityMe, SharingState, type Activity } from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { createStore, usePolling, useStore } from "@/shared/ui";
import { useEffect } from "react";

/**
 * One poller for everything the activities UI shows, so the map layer (always mounted) and
 * the panel (mounted while its tab is open) share it instead of polling twice. The layer
 * runs `useActivitiesPoller()`; everything reads `useActivitiesFeed()`.
 */

interface FeedState {
  activities: Activity[] | null;
  me: ActivityMe | null;
  /** Whether the user shares location; null until known or when not in an activity. Kept in step with the Crowds panel and Settings by `SHARING_CHANGED_EVENT`. */
  sharing: boolean | null;
  error: string | null;
}

const store = createStore<FeedState>({ activities: null, me: null, sharing: null, error: null });

/** Poll while in an activity: verified time moves. Otherwise the list changes slowly. */
const ACTIVE_POLL_MS = 5_000;
const IDLE_POLL_MS = 10_000;

export async function refreshFeed(signal?: AbortSignal): Promise<void> {
  try {
    const [activities, me] = await Promise.all([
      apiFetch("/api/activities", { schema: ActivityList, signal }),
      apiFetch("/api/activities/me", { schema: ActivityMe, signal }),
    ]);
    let sharing: boolean | null = null;
    if (me.participation) {
      sharing = await apiFetch("/api/presence/sharing", { schema: SharingState, signal })
        .then((s) => s.enabled)
        .catch(() => null);
    }
    store.set({ activities, me, sharing, error: null });
  } catch (cause) {
    if (signal?.aborted) return;
    store.set({ error: cause instanceof ApiClientError ? cause.message : "Could not load activities" });
  }
}

/**
 * Fired on `window` after any control changes the location-sharing setting (the Crowds panel,
 * Settings, the activity card), with `{ enabled }` as the detail. The one setting lives on the
 * server; each screen keeps its own copy, and this keeps the copies from drifting. The same name
 * is used by density/ui/state.ts and app/_shell/Settings.tsx (modules cannot import each other's ui).
 */
export const SHARING_CHANGED_EVENT = "zoomap:sharing-changed";

export function announceSharing(enabled: boolean): void {
  window.dispatchEvent(new CustomEvent(SHARING_CHANGED_EVENT, { detail: { enabled } }));
}

export function useActivitiesPoller(): void {
  const inActivity = useStore(store, (s) => !!s.me?.participation);
  usePolling(refreshFeed, { intervalMs: inActivity ? ACTIVE_POLL_MS : IDLE_POLL_MS, key: inActivity });

  // another screen switched sharing on or off: show it on the card now, not at the next poll
  useEffect(() => {
    const onChange = (e: Event) => {
      const enabled = (e as CustomEvent<{ enabled?: unknown }>).detail?.enabled;
      if (typeof enabled === "boolean" && store.get().me?.participation) store.set({ sharing: enabled });
    };
    window.addEventListener(SHARING_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(SHARING_CHANGED_EVENT, onChange);
  }, []);
}

export function useActivitiesFeed() {
  const activities = useStore(store, (s) => s.activities);
  const me = useStore(store, (s) => s.me);
  const sharing = useStore(store, (s) => s.sharing);
  const error = useStore(store, (s) => s.error);
  return { activities, me, sharing, error };
}

export const CATEGORY_COLORS: Record<Activity["category"], string> = {
  study: "#7c3aed",
  social: "#db2777",
  sports: "#ea580c",
  food: "#ca8a04",
  other: "#0d9488",
};

export const CATEGORY_LABELS: Record<Activity["category"], string> = {
  study: "Study",
  social: "Social",
  sports: "Sports",
  food: "Food",
  other: "Other",
};
