"use client";

import {
  ActivityMe,
  FriendList,
  InviteList,
  Profile,
  type ActivityInvite,
  type Friend,
  type Profile as ProfileT,
} from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { createStore, usePolling, useStore } from "@/shared/ui";

/**
 * What the friends UI shows, shared by the panel and the invite banner. The banner (always
 * mounted) polls invites; the panel loads the rest when it opens and after each action.
 */

interface FriendsState {
  me: ProfileT | null;
  friends: Friend[] | null;
  invites: ActivityInvite[];
  /** The activity you are in, for inviting friends to it. */
  current: ActivityMe | null;
  error: string | null;
}

const store = createStore<FriendsState>({ me: null, friends: null, invites: [], current: null, error: null });

export const INVITE_POLL_MS = 15_000;

export function errorText(cause: unknown): string {
  return cause instanceof ApiClientError ? cause.message : "Something went wrong";
}

export async function refreshInvites(signal?: AbortSignal): Promise<void> {
  try {
    store.set({ invites: await apiFetch("/api/friends/invites", { schema: InviteList, signal }) });
  } catch {
    // the banner stays quiet on a failed poll; the next one retries
  }
}

export async function refreshFriends(signal?: AbortSignal): Promise<void> {
  try {
    const [me, friends, current] = await Promise.all([
      apiFetch("/api/profile/me", { schema: Profile, signal }),
      apiFetch("/api/friends", { schema: FriendList, signal }),
      apiFetch("/api/activities/me", { schema: ActivityMe, signal }),
    ]);
    store.set({ me, friends, current, error: null });
  } catch (cause) {
    if (signal?.aborted) return;
    store.set({ error: errorText(cause) });
  }
  await refreshInvites(signal);
}

export function setMyProfile(me: ProfileT): void {
  store.set({ me });
}

export function useInvitePoller(): void {
  usePolling(refreshInvites, { intervalMs: INVITE_POLL_MS });
}

export function useFriendsFeed() {
  const me = useStore(store, (s) => s.me);
  const friends = useStore(store, (s) => s.friends);
  const invites = useStore(store, (s) => s.invites);
  const current = useStore(store, (s) => s.current);
  const error = useStore(store, (s) => s.error);
  return { me, friends, invites, current, error };
}
