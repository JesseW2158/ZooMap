"use client";

import { useEffect, type ReactNode } from "react";
import type { Conversation, Friend } from "@/shared/contracts";
import { refreshFriends, useFriendsFeed } from "./feed";
import { ChatOverlay } from "./Chat";
import { closeChat, openChat, useConversations } from "./messages-feed";
import { ChatIcon, UsersIcon } from "./icons";
import { Avatar } from "./parts";

/**
 * Direct messages, on their own tab: conversations with friends (newest first), then the
 * friends you have not written to yet so a first chat can be started. Only friends appear
 * here; the server checks the friendship on every call as well.
 */
export function MessagesPanel() {
  const { friends, error } = useFriendsFeed();
  const { conversations, openWith } = useConversations();

  useEffect(() => {
    void refreshFriends();
  }, []);

  const talkingTo = new Set(conversations?.map((c) => c.friend.userId) ?? []);
  const notYet = friends?.filter((f) => !talkingTo.has(f.userId)) ?? [];
  const loading = conversations === null || friends === null;

  return (
    <div className="space-y-5 text-sm text-ink">
      {error ? <p className="text-red-600">{error}</p> : null}

      {loading ? <Skeleton /> : null}

      {!loading && friends?.length === 0 && !conversations?.length ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-linen px-4 py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-lavender text-ink" aria-hidden>
            <ChatIcon className="h-7 w-7" />
          </span>
          <p className="font-semibold">No friends to message yet</p>
          <p className="text-yale">Add a friend with their code in the Friends tab, then chat with them here.</p>
        </div>
      ) : null}

      {conversations?.length ? (
        <section className="space-y-2">
          <SectionLabel Icon={ChatIcon} text="Chats" count={conversations.length} />
          <ul className="space-y-2">
            {conversations.map((c) => (
              <ConversationRow key={c.friend.userId} c={c} />
            ))}
          </ul>
        </section>
      ) : null}

      {!loading && notYet.length ? (
        <section className="space-y-2">
          <SectionLabel Icon={UsersIcon} text="Start a chat" count={notYet.length} />
          <ul className="-mx-2">
            {notYet.map((f) => (
              <FriendRow key={f.userId} f={f} />
            ))}
          </ul>
        </section>
      ) : null}

      {openWith ? <ChatOverlay key={openWith.userId} friend={openWith} onClose={closeChat} /> : null}
    </div>
  );
}

function SectionLabel({ Icon, text, count }: { Icon: (p: { className?: string }) => ReactNode; text: string; count?: number }) {
  return (
    <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-yale">
      <Icon className="h-4 w-4" />
      {text}
      {count !== undefined ? <span className="rounded-full bg-linen px-2 py-0.5 text-[11px] text-ink">{count}</span> : null}
    </h2>
  );
}

const shortTime = (iso: string) => {
  const d = new Date(iso);
  return Date.now() - d.getTime() < 86_400_000
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

function ConversationRow({ c }: { c: Conversation }) {
  const theirs = c.lastMessage.fromUserId === c.friend.userId;
  return (
    <li>
      <button
        type="button"
        onClick={() => openChat({ userId: c.friend.userId, name: c.friend.name, image: c.friend.image })}
        className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white p-2.5 text-left hover:bg-neutral-50"
      >
        <Avatar person={c.friend} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={`min-w-0 flex-1 truncate ${c.unread ? "font-bold" : "font-semibold"}`}>{c.friend.name}</span>
            <span className="shrink-0 text-xs text-neutral-500">{shortTime(c.lastMessage.createdAt)}</span>
          </span>
          <span className={`block truncate ${c.unread ? "font-medium text-neutral-900" : "text-neutral-500"}`}>
            {theirs ? "" : "You: "}
            {c.lastMessage.body}
          </span>
        </span>
        {c.unread ? (
          <span aria-label={`${c.unread} unread`} className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
            {c.unread > 99 ? "99+" : c.unread}
          </span>
        ) : null}
      </button>
    </li>
  );
}

function FriendRow({ f }: { f: Friend }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => openChat({ userId: f.userId, name: f.name, image: f.image })}
        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-linen/70"
      >
        <Avatar person={f} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{f.name}</span>
          {f.pronouns ? <span className="block truncate text-xs text-yale">{f.pronouns}</span> : null}
        </span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lavender text-ink" aria-hidden>
          <ChatIcon className="h-5 w-5" />
        </span>
        <span className="sr-only">Message {f.name}</span>
      </button>
    </li>
  );
}

function Skeleton() {
  return (
    <ul className="space-y-2">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 py-1">
          <span className="h-11 w-11 animate-pulse rounded-full bg-linen" />
          <span className="h-3 w-32 animate-pulse rounded bg-linen" />
        </li>
      ))}
    </ul>
  );
}
