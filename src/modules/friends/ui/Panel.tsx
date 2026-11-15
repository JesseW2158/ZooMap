"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { InviteResult, Profile, type Conversation, type Friend, type Profile as ProfileT } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import { errorText, refreshFriends, setMyProfile, useFriendsFeed } from "./feed";
import { ChatOverlay } from "./Chat";
import { closeChat, openChat, useConversations } from "./messages-feed";
import { FriendCodeOverlay, Overlay } from "./overlays";
import { ChatIcon, CheckIcon, HeartIcon, MailIcon, PencilIcon, QrAddIcon, SendIcon, UserMinusIcon, UserPlusIcon } from "./icons";
import { Avatar, ContactButtons, InviteCard } from "./parts";

/**
 * Chat: you (with your friend code and Edit as symbols), pending invites, and every friend in one
 * list, most recent conversation first. Tapping a friend opens your chat with them; tapping their
 * avatar (or their name in the chat) opens their profile. There is no search: the only way to add
 * someone is their code.
 */
export function FriendsPanel() {
  const { me, friends, invites, current, error } = useFriendsFeed();
  const { conversations, openWith } = useConversations();
  const [overlay, setOverlay] = useState<"code" | null>(null);
  const [editing, setEditing] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const profile = profileId ? (friends?.find((f) => f.userId === profileId) ?? null) : null;

  useEffect(() => {
    void refreshFriends();
  }, []);

  return (
    <div className="space-y-5 text-sm text-ink">
      {me && editing ? (
        <ProfileEditor me={me} onDone={() => setEditing(false)} />
      ) : (
        <section className="flex items-center gap-3">
          {me ? (
            <Avatar person={me} size={56} />
          ) : (
            <span className="h-14 w-14 animate-pulse rounded-full bg-linen" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold">{me?.name ?? " "}</p>
            {me?.pronouns ? <p className="truncate text-yale">{me.pronouns}</p> : null}
          </div>
          <RoundButton label="Friend code: show yours or scan a friend's" onClick={() => setOverlay("code")} primary>
            <QrAddIcon className="h-5 w-5" />
          </RoundButton>
          {me ? (
            <RoundButton label="Edit" onClick={() => setEditing(true)}>
              <PencilIcon className="h-5 w-5" />
            </RoundButton>
          ) : null}
        </section>
      )}

      {error ? <p className="text-red-600">{error}</p> : null}

      {invites.length ? (
        <section className="space-y-2">
          <SectionLabel Icon={MailIcon} text="Invites" count={invites.length} />
          {invites.map((invite) => (
            <InviteCard key={invite.id} invite={invite} />
          ))}
        </section>
      ) : null}

      <FriendsList
        friends={friends}
        conversations={conversations}
        current={current?.participation ? current.activity : null}
        onAdd={() => setOverlay("code")}
        onProfile={setProfileId}
      />

      {openWith ? (
        <ChatOverlay key={openWith.userId} friend={openWith} onClose={closeChat} onProfile={() => setProfileId(openWith.userId)} />
      ) : null}
      {/* after the chat, so it opens on top when reached from the chat header */}
      {profile ? (
        <ProfileOverlay
          friend={profile}
          onClose={() => setProfileId(null)}
          onMessage={() => {
            setProfileId(null);
            if (openWith?.userId !== profile.userId) openChat({ userId: profile.userId, name: profile.name, image: profile.image });
          }}
          onUnfriended={() => {
            setProfileId(null);
            if (openWith?.userId === profile.userId) closeChat();
          }}
        />
      ) : null}

      {overlay ? <FriendCodeOverlay me={me} onClose={() => setOverlay(null)} /> : null}
    </div>
  );
}

function RoundButton({ label, onClick, primary = false, children }: { label: string; onClick: () => void; primary?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
        primary ? "bg-ink text-ivory hover:bg-yale" : "bg-linen text-ink hover:bg-ash/50"
      }`}
    >
      {children}
    </button>
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

/** A friend and, once you've written to each other, your conversation with them. */
interface Row {
  friend: Friend;
  convo: Conversation | null;
}

/** Most recent chat first, then friends you haven't written to yet, by name. */
function chatRows(friends: Friend[], conversations: Conversation[] | null): Row[] {
  const byFriend = new Map((conversations ?? []).map((c) => [c.friend.userId, c]));
  return friends
    .map((friend) => ({ friend, convo: byFriend.get(friend.userId) ?? null }))
    .sort((a, b) => {
      if (a.convo && b.convo) return b.convo.lastMessage.createdAt.localeCompare(a.convo.lastMessage.createdAt);
      if (a.convo || b.convo) return a.convo ? -1 : 1;
      return a.friend.name.localeCompare(b.friend.name);
    });
}

const shortTime = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
};

/** The line under a friend's name: new messages, the last one, or a nudge to start. */
function Status({ row }: { row: Row }) {
  const { convo, friend } = row;
  if (!convo) return <span className="block truncate text-xs text-yale">Tap to chat</span>;
  const time = shortTime(convo.lastMessage.createdAt);
  if (convo.unread) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-bold text-red-600">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-red-600" />
        <span className="truncate">{convo.unread === 1 ? "New message" : `${convo.unread > 99 ? "99+" : convo.unread} new messages`}</span>
        <span className="shrink-0 font-normal text-yale">· {time}</span>
      </span>
    );
  }
  const theirs = convo.lastMessage.fromUserId === friend.userId;
  return (
    <span className="flex items-center gap-1 text-xs text-yale">
      <span className="min-w-0 truncate">
        {theirs ? "" : "You: "}
        {convo.lastMessage.body}
      </span>
      <span className="shrink-0">· {time}</span>
    </span>
  );
}

function FriendsList({
  friends,
  conversations,
  current,
  onAdd,
  onProfile,
}: {
  friends: Friend[] | null;
  conversations: Conversation[] | null;
  current: { id: string; title: string } | null;
  onAdd: () => void;
  onProfile: (userId: string) => void;
}) {
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const choosing = selecting && !!current;
  const rows = friends ? chatRows(friends, conversations) : null;

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const invite = async () => {
    if (!current || picked.size === 0) return;
    setSending(true);
    setResult(null);
    try {
      const r = await apiFetch("/api/friends/invites", {
        method: "POST",
        body: { activityId: current.id, toUserIds: [...picked] },
        schema: InviteResult,
      });
      const name = (id: string) => friends?.find((f) => f.userId === id)?.name.split(" ")[0] ?? "someone";
      const notes = r.skipped.map((s) =>
        s.reason === "already_in_activity" ? `${name(s.userId)} is already there` : s.reason === "already_invited" ? `${name(s.userId)} was already invited` : `${name(s.userId)} was skipped`,
      );
      setResult([r.sent.length ? `Sent ${r.sent.length} ${r.sent.length === 1 ? "invite" : "invites"}.` : "No new invites.", ...notes].join(" "));
      setPicked(new Set());
      setSelecting(false);
    } catch (cause) {
      setResult(errorText(cause));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel Icon={ChatIcon} text="Chats" count={friends?.length} />
        {current && friends?.length ? (
          <button
            type="button"
            onClick={() => {
              setSelecting((x) => !x);
              setPicked(new Set());
              setResult(null);
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${choosing ? "bg-linen text-ink" : "bg-rose text-ink"}`}
          >
            {choosing ? (
              "Cancel"
            ) : (
              <>
                <SendIcon className="h-3.5 w-3.5" /> Invite
              </>
            )}
          </button>
        ) : null}
      </div>

      {rows === null ? (
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 py-1">
              <span className="h-11 w-11 animate-pulse rounded-full bg-linen" />
              <span className="h-3 w-32 animate-pulse rounded bg-linen" />
            </li>
          ))}
        </ul>
      ) : null}

      {rows?.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-linen px-4 py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose text-ink" aria-hidden>
            <UserPlusIcon className="h-7 w-7" />
          </span>
          <p className="font-semibold">Add your first friend</p>
          <p className="text-yale">Swap codes with a friend, then chat with them here.</p>
          <button type="button" onClick={onAdd} className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 font-semibold text-ivory">
            <QrAddIcon className="h-4 w-4" /> Friend Code
          </button>
        </div>
      ) : null}

      {result ? <p className="rounded-xl bg-linen px-3 py-2 text-ink">{result}</p> : null}

      <ul className="-mx-2">
        {rows?.map((row) => {
          const f = row.friend;
          const isPicked = picked.has(f.userId);
          const unread = !!row.convo?.unread;
          const chat = () => openChat({ userId: f.userId, name: f.name, image: f.image });
          return (
            <li key={f.userId} className="flex items-center gap-3 rounded-2xl px-2 transition-colors hover:bg-linen/70">
              {/* the avatar opens the profile; the rest of the row opens the chat */}
              <button
                type="button"
                onClick={() => (choosing ? toggle(f.userId) : onProfile(f.userId))}
                aria-label={choosing ? undefined : `${f.name}'s profile`}
                tabIndex={choosing ? -1 : undefined}
                className="relative shrink-0 rounded-full py-2 focus-visible:outline-2 focus-visible:outline-ink"
              >
                <span className={`block rounded-full ${unread && !choosing ? "p-0.5 ring-2 ring-red-600" : ""}`}>
                  <Avatar person={f} size={44} />
                </span>
                {choosing ? (
                  <span
                    aria-hidden
                    className={`absolute bottom-1.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white ${isPicked ? "bg-ink text-ivory" : "bg-white text-transparent ring-ash"}`}
                  >
                    <CheckIcon className="h-3 w-3" />
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                aria-pressed={choosing ? isPicked : undefined}
                onClick={() => (choosing ? toggle(f.userId) : chat())}
                className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${unread ? "font-bold" : "font-semibold"}`}>{f.name}</span>
                  <Status row={row} />
                </span>
                {!choosing ? (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-yale" aria-hidden>
                    <ChatIcon className="h-5 w-5" />
                  </span>
                ) : null}
                <span className="sr-only">{choosing ? "" : `Message ${f.name}`}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {choosing ? (
        <div className="sticky bottom-2 flex items-center gap-2 rounded-full bg-ink p-1.5 pl-4 text-ivory shadow-lg">
          <p className="min-w-0 flex-1 truncate text-sm">
            {picked.size ? `${picked.size} selected` : "Pick friends"} · <span className="font-semibold">{current!.title}</span>
          </p>
          <button
            type="button"
            disabled={sending || picked.size === 0}
            onClick={invite}
            aria-label="Send invites"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-rose text-ink disabled:opacity-40"
          >
            <SendIcon className="h-5 w-5" />
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** A friend's card: contact buttons, how long you've been friends, Message and Unfriend. */
function ProfileOverlay({ friend, onMessage, onClose, onUnfriended }: { friend: Friend; onMessage: () => void; onClose: () => void; onUnfriended: () => void }) {
  return (
    <Overlay title="Profile" onClose={onClose}>
      <Avatar person={friend} size={96} />
      <div className="text-center">
        <p className="text-xl font-bold">{friend.name}</p>
        {friend.pronouns ? <p className="text-yale">{friend.pronouns}</p> : null}
        <p className="mt-1 flex items-center justify-center gap-1 text-xs text-yale">
          <HeartIcon className="h-3.5 w-3.5" />
          friends since {new Date(friend.since).toLocaleDateString([], { month: "short", year: "numeric" })}
        </p>
      </div>
      <button type="button" onClick={onMessage} className="flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-ivory">
        <ChatIcon className="h-5 w-5" /> Message
      </button>
      <ContactButtons profile={friend} />
      <UnfriendButton friend={friend} onDone={onUnfriended} />
    </Overlay>
  );
}

/** Two taps to unfriend: the first arms the button for a few seconds. */
function UnfriendButton({ friend, onDone }: { friend: Friend; onDone?: () => void }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const tap = async () => {
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/friends/${friend.userId}`, { method: "DELETE" });
      await refreshFriends();
      onDone?.();
    } finally {
      setBusy(false);
      setArmed(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={tap}
      aria-label={`Unfriend ${friend.name}`}
      title="Unfriend"
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${armed ? "bg-red-600 text-white" : "text-red-700 hover:bg-red-50"}`}
    >
      <UserMinusIcon className="h-4 w-4" />
      {armed ? "Tap again" : "Unfriend"}
    </button>
  );
}

function ProfileEditor({ me, onDone }: { me: ProfileT; onDone: () => void }) {
  const [pronouns, setPronouns] = useState(me.pronouns ?? "");
  const [phone, setPhone] = useState(me.phone ?? "");
  const [email, setEmail] = useState(me.email ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const saved = await apiFetch("/api/profile/me", {
        method: "PUT",
        schema: Profile,
        body: {
          pronouns: pronouns.trim() || null,
          phone: phone.trim() || null,
          contactEmail: email.trim() || null,
        },
      });
      setMyProfile(saved);
      onDone();
    } catch (cause) {
      setMessage(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-xl border-0 bg-linen px-3 py-2.5 text-ink placeholder:text-yale/50 focus:outline-2 focus:outline-ink";
  return (
    <form onSubmit={save} className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar person={me} size={40} />
        <p className="min-w-0 flex-1 truncate font-semibold">{me.name}</p>
        <button type="button" onClick={onDone} className="rounded-full bg-linen px-3 py-1.5 font-medium">
          Cancel
        </button>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-yale">Pronouns</span>
        <input maxLength={40} value={pronouns} onChange={(e) => setPronouns(e.target.value)} className={input} placeholder="she/her, they/them…" />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-yale">Phone</span>
        <input type="tel" inputMode="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} className={input} placeholder="(413) 555-0100" />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-yale">Contact email</span>
        <input type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="Shown to friends" />
      </label>
      {message ? <p className="text-red-600">{message}</p> : null}
      <button type="submit" disabled={busy} className="w-full rounded-full bg-ink px-4 py-3 font-semibold text-ivory disabled:opacity-50">
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
