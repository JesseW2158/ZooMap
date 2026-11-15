"use client";

import { useEffect, useRef, useState } from "react";
import { ChatResponse, type ChatBody, type ChatCard, type ChatMessage } from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { useUserLocation } from "@/shared/platform";
import { createStore, useMapStore, useStore } from "@/shared/ui";

/**
 * "Ask": a campus chatbot. The conversation lives in this tab's memory only (it survives
 * switching tabs, not a reload) and the last messages go to the server with each question.
 */

interface Turn extends ChatMessage {
  cards?: ChatCard[];
  source?: ChatResponse["source"];
}

const HISTORY_SENT = 10;
const chatStore = createStore<{ turns: Turn[]; pending: boolean; error: string | null }>({ turns: [], pending: false, error: null });

const SUGGESTIONS = ["Anyone playing soccer?", "Quiet study spot near me", "What's happening right now?", "How busy is the Du Bois Library?"];
const LEVEL_WORDS = ["Empty", "Quiet", "Moderate", "Busy", "Packed"];

async function send(text: string, origin: ChatBody["origin"]) {
  const s = chatStore.get();
  if (s.pending || !text.trim()) return;
  const turns: Turn[] = [...s.turns, { role: "user", text: text.trim().slice(0, 1000) }];
  chatStore.set({ turns, pending: true, error: null });
  try {
    const messages: ChatMessage[] = turns.slice(-HISTORY_SENT).map(({ role, text }) => ({ role, text: text.slice(0, 1000) }));
    // the server wants the conversation to start with the student
    while (messages[0]?.role === "assistant") messages.shift();
    const res = await apiFetch("/api/assistant/chat", { method: "POST", body: { messages, origin }, schema: ChatResponse });
    chatStore.set({ turns: [...turns, { role: "assistant", text: res.reply, cards: res.cards, source: res.source }], pending: false });
  } catch (err) {
    const msg = err instanceof ApiClientError && err.code === "UNAUTHORIZED" ? "Sign in to use the assistant." : err instanceof Error ? err.message : "Something went wrong.";
    chatStore.set({ pending: false, error: msg });
  }
}

export function AssistantPanel() {
  const turns = useStore(chatStore, (s) => s.turns);
  const pending = useStore(chatStore, (s) => s.pending);
  const error = useStore(chatStore, (s) => s.error);
  const [draft, setDraft] = useState("");
  const { position } = useUserLocation();
  const { selectedPlaceId } = useMapStore();
  const endRef = useRef<HTMLDivElement>(null);

  const origin: ChatBody["origin"] = position ? { lat: position.lat, lng: position.lng } : selectedPlaceId ? { placeId: selectedPlaceId } : undefined;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length, pending]);

  const submit = (text: string) => {
    setDraft("");
    void send(text, origin);
  };

  return (
    <div className="flex flex-col gap-3 p-4 text-sm text-ink">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Ask ZooMap</h2>
          <p className="text-xs text-yale">Activities happening now, study spots, and how busy a building is.</p>
        </div>
        {turns.length ? (
          <button type="button" className="shrink-0 text-xs text-yale underline" onClick={() => chatStore.set({ turns: [], error: null })}>
            New chat
          </button>
        ) : null}
      </div>

      {turns.length === 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => submit(s)} className="rounded-full border border-ash bg-white px-3 py-1 text-xs text-yale hover:bg-ivory">
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <ol className="flex flex-col gap-2" aria-live="polite">
        {turns.map((t, i) => (
          <li key={i} className={t.role === "user" ? "self-end max-w-[85%]" : "self-start w-full"}>
            {t.role === "user" ? (
              <div className="rounded-2xl rounded-br-sm bg-ink px-3 py-2 text-white">{t.text}</div>
            ) : (
              <div className="space-y-2">
                <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-ash bg-ivory px-3 py-2">
                  <p className="whitespace-pre-wrap">{t.text}</p>
                  {t.source === "fallback" ? <p className="mt-1 text-[11px] text-yale">Quick answer without AI (Gemini unavailable).</p> : null}
                </div>
                {t.cards?.length ? (
                  <div className="space-y-1.5">
                    {t.cards.map((c) => (
                      <Card key={c.kind === "activity" ? c.activity.id : c.placeId} card={c} />
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </li>
        ))}
        {pending ? (
          <li className="self-start rounded-2xl rounded-bl-sm border border-ash bg-ivory px-3 py-2 text-yale">
            <span className="animate-pulse">Thinking…</span>
          </li>
        ) : null}
      </ol>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div ref={endRef} />

      <form
        className="sticky bottom-0 flex gap-2 bg-white/90 py-1 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <input
          type="text"
          value={draft}
          maxLength={1000}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about activities or study spots"
          aria-label="Message"
          className="min-w-0 flex-1 rounded-full border border-ash bg-white px-4 py-2 placeholder:text-neutral-400"
        />
        <button type="submit" disabled={pending || !draft.trim()} className="shrink-0 rounded-full bg-ink px-4 py-2 font-medium text-white disabled:opacity-50">
          Send
        </button>
      </form>
    </div>
  );
}

function Card({ card }: { card: ChatCard }) {
  const { selectPlace, requestRoute } = useMapStore();
  const [joinState, setJoinState] = useState<string | null>(null);

  if (card.kind === "place") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-ash bg-white px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{card.name}</div>
          <div className="text-xs text-yale">
            {card.level !== undefined ? LEVEL_WORDS[card.level] : null}
            {card.simulated ? " (estimate)" : ""}
            {card.walkMin !== undefined ? ` · ${Math.max(1, Math.round(card.walkMin))} min walk` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            selectPlace(card.placeId);
            requestRoute(card.placeId);
          }}
          className="shrink-0 rounded-lg bg-ink px-3 py-1 text-xs font-medium text-white"
        >
          Route
        </button>
      </div>
    );
  }

  const a = card.activity;
  const full = a.capacity !== undefined && a.participantCount >= a.capacity;
  const join = async () => {
    setJoinState("Joining…");
    try {
      await apiFetch(`/api/activities/${encodeURIComponent(a.id)}/join`, { method: "POST" });
      setJoinState("Joined");
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : null;
      setJoinState(
        code === "ALREADY_IN_ACTIVITY"
          ? "Leave your current activity first"
          : code === "CAPACITY_FULL"
            ? "It's full"
            : code === "ACTIVITY_ENDED"
              ? "It has ended"
              : "Could not join",
      );
    }
  };

  return (
    <div className="rounded-xl border border-ash bg-white px-3 py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{a.title}</div>
          <div className="text-xs text-yale">
            {a.placeName ?? "On campus"} · {a.participantCount}
            {a.capacity ? `/${a.capacity}` : ""} there · {a.category}
          </div>
          {a.description ? <p className="mt-0.5 line-clamp-2 text-xs text-yale">{a.description}</p> : null}
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          disabled={full || joinState === "Joining…" || joinState === "Joined"}
          onClick={() => void join()}
          className="rounded-lg bg-ink px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {joinState === "Joined" ? "Joined" : full ? "Full" : "Join"}
        </button>
        <button
          type="button"
          onClick={() => {
            selectPlace(a.placeId);
            requestRoute(a.placeId);
          }}
          className="rounded-lg border border-ash bg-white px-3 py-1 text-xs"
        >
          Route
        </button>
        {joinState && joinState !== "Joined" && joinState !== "Joining…" ? <span className="text-xs text-red-700">{joinState}</span> : null}
      </div>
    </div>
  );
}
