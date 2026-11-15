"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { DirectMessage, DirectMessageList, DM_MAX_LENGTH, type DirectMessage as Message } from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { usePolling } from "@/shared/ui";
import { errorText } from "./feed";
import { messagesChanged } from "./messages-feed";
import { Avatar } from "./parts";

/** How often an open chat checks for new messages (no websockets on Vercel). */
const CHAT_POLL_MS = 3_000;

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

function merge(prev: Message[], next: Message[]): Message[] {
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of next) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Full-screen direct messages with one friend. Portalled to <body>, like the friend code screen. */
export function ChatOverlay({
  friend,
  onClose,
  onProfile,
}: {
  friend: { userId: string; name: string; image: string | null };
  onClose: () => void;
  /** Tapping the name in the header opens the friend's profile, when given. */
  onProfile?: () => void;
}) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [gone, setGone] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const latest = useRef<string | null>(null);
  const base = `/api/messages/${encodeURIComponent(friend.userId)}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const poll = useCallback(
    async (signal: AbortSignal) => {
      if (gone) return;
      try {
        const q = latest.current ? `?after=${encodeURIComponent(latest.current)}` : "";
        const fresh = await apiFetch(`${base}${q}`, { schema: DirectMessageList, signal });
        setMessages((prev) => {
          const all = merge(prev ?? [], fresh);
          latest.current = all.at(-1)?.createdAt ?? latest.current;
          return all;
        });
        // anything new from them is now read
        if (fresh.some((m) => m.fromUserId === friend.userId && m.readAt === null)) {
          await apiFetch(`${base}/read`, { method: "POST", signal });
          messagesChanged();
        }
      } catch (cause) {
        if (cause instanceof ApiClientError && cause.code === "NOT_FOUND") setGone(true);
      }
    },
    [base, friend.userId, gone],
  );
  usePolling(poll, { intervalMs: CHAT_POLL_MS, key: friend.userId });

  // stay pinned to the newest message
  const count = messages?.length ?? 0;
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await apiFetch(base, { method: "POST", body: { body }, schema: DirectMessage });
      setDraft("");
      setMessages((prev) => merge(prev ?? [], [sent]));
      messagesChanged();
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === "NOT_FOUND") setGone(true);
      else setError(errorText(cause));
    } finally {
      setSending(false);
    }
  };

  const lastMine = [...(messages ?? [])].reverse().find((m) => m.fromUserId !== friend.userId);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Messages with ${friend.name}`} className="fixed inset-0 z-50 flex flex-col bg-linen text-ink">
      <header className="flex shrink-0 items-center gap-3 bg-ink p-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-ivory">
        <button type="button" onClick={onClose} aria-label="Back" className="rounded-lg px-2 py-1 text-lg font-semibold hover:bg-white/10">
          ←
        </button>
        {onProfile ? (
          <button
            type="button"
            onClick={onProfile}
            aria-label={`${friend.name}'s profile`}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-0.5 pr-2 text-left hover:bg-white/10"
          >
            <Avatar person={friend} size={36} />
            <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{friend.name}</h2>
          </button>
        ) : (
          <>
            <Avatar person={friend} size={36} />
            <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{friend.name}</h2>
          </>
        )}
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
          {messages === null && !gone ? <p className="text-center text-sm text-yale">Loading…</p> : null}
          {messages?.length === 0 ? <p className="text-center text-sm text-yale">No messages yet. Say hi to {friend.name.split(" ")[0]}.</p> : null}
          {messages?.map((m, i) => {
            const mine = m.fromUserId !== friend.userId;
            const prev = messages[i - 1];
            const newDay = !prev || dayFmt.format(new Date(prev.createdAt)) !== dayFmt.format(new Date(m.createdAt));
            return (
              <div key={m.id} className="flex flex-col">
                {newDay ? <p className="my-2 text-center text-xs text-yale">{dayFmt.format(new Date(m.createdAt))}</p> : null}
                <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <p
                    className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                      mine ? "rounded-br-md bg-ink text-ivory" : "rounded-bl-md bg-white text-ink shadow-sm"
                    }`}
                    title={timeFmt.format(new Date(m.createdAt))}
                  >
                    {m.body}
                  </p>
                </div>
                {m === lastMine ? (
                  <p className="mt-0.5 text-right text-[11px] text-yale">
                    {m.readAt ? "Seen" : "Sent"} · {timeFmt.format(new Date(m.createdAt))}
                  </p>
                ) : null}
              </div>
            );
          })}
          {gone ? <p className="mt-4 rounded-xl bg-white p-3 text-center text-sm text-yale">You and {friend.name} are no longer friends, so this conversation is closed.</p> : null}
        </div>
      </div>

      {!gone ? (
        <form onSubmit={send} className="shrink-0 border-t border-ash/60 bg-ivory p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {error ? <p className="mx-auto mb-2 max-w-2xl text-sm text-red-700">{error}</p> : null}
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={1}
              maxLength={DM_MAX_LENGTH}
              placeholder="Message"
              aria-label={`Message ${friend.name}`}
              className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-ash bg-white px-3 py-2 text-sm text-ink placeholder:text-yale/60"
            />
            <button type="submit" disabled={sending || !draft.trim()} className="h-10 rounded-full bg-ink px-4 text-sm font-semibold text-ivory disabled:opacity-40">
              {sending ? "…" : "Send"}
            </button>
          </div>
        </form>
      ) : null}
    </div>,
    document.body,
  );
}
