"use client";

import { useState } from "react";
import { useFriendsFeed, useInvitePoller } from "./feed";
import { CloseIcon } from "./icons";
import { InviteCard } from "./parts";

/**
 * Headless entry (mounted once by the shell): polls activity invites every 15 seconds and
 * shows the newest one over the map, whichever tab is open. Dismissing hides it for this
 * visit; it stays listed in the Friends tab.
 */
export function FriendsInviteBanner() {
  useInvitePoller();
  const { invites } = useFriendsFeed();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const invite = invites.find((i) => !dismissed.has(i.id));
  if (!invite) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-20 flex justify-center px-3">
      <div className="pointer-events-auto relative w-full max-w-md shadow-lg">
        <InviteCard invite={invite} compact />
        <button
          type="button"
          onClick={() => setDismissed((s) => new Set(s).add(invite.id))}
          aria-label="Dismiss"
          className="absolute right-2 top-2 rounded-full px-2 text-neutral-500"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
