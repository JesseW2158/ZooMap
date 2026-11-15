"use client";

import { useFriendsFeed, useInvitePoller } from "./feed";
import { InviteCard } from "./parts";

/**
 * Headless entry (mounted once by the shell): polls activity invites every 15 seconds and
 * shows the newest one over the map, whichever tab is open, until it is accepted or declined.
 * It is also listed in the Friends tab.
 */
export function FriendsInviteBanner() {
  useInvitePoller();
  const { invites } = useFriendsFeed();
  const invite = invites[0];
  if (!invite) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-20 flex justify-center px-3">
      <div className="pointer-events-auto w-full max-w-md shadow-lg">
        <InviteCard invite={invite} compact />
      </div>
    </div>
  );
}
