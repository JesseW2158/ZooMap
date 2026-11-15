"use client";

import { ConversationList, type Conversation } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import { createStore, usePolling, useStore } from "@/shared/ui";

/**
 * The inbox shown in the Chat tab (merged into the friends list), and which chat is open. The shell's tab badge polls
 * `/api/messages/unread` on its own and also listens for `MESSAGES_CHANGED_EVENT`, which this
 * module fires after reading or sending so the badge updates at once.
 */

export const MESSAGES_CHANGED_EVENT = "zoomap:messages-changed";
const INBOX_POLL_MS = 10_000;

interface MessagesState {
  conversations: Conversation[] | null;
  /** The friend whose chat is open, or null. */
  openWith: { userId: string; name: string; image: string | null } | null;
}

const store = createStore<MessagesState>({ conversations: null, openWith: null });

export function messagesChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MESSAGES_CHANGED_EVENT));
}

export async function refreshConversations(signal?: AbortSignal): Promise<void> {
  try {
    store.set({ conversations: await apiFetch("/api/messages", { schema: ConversationList, signal }) });
  } catch {
    // a failed poll keeps the last list; the next one retries
  }
}

export function openChat(friend: { userId: string; name: string; image: string | null }): void {
  store.set({ openWith: friend });
}

export function closeChat(): void {
  store.set({ openWith: null });
  void refreshConversations();
  messagesChanged();
}

/** Polls the inbox while the Chat tab is open. */
export function useConversations() {
  usePolling(refreshConversations, { intervalMs: INBOX_POLL_MS });
  const conversations = useStore(store, (s) => s.conversations);
  const openWith = useStore(store, (s) => s.openWith);
  return { conversations, openWith };
}
