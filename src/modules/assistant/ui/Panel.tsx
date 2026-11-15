"use client";

import { useEffect, useRef, useState } from "react";
import { ChatResponse, PlannedEvent, type Activity, type ChatBody, type ChatCard, type ChatMessage } from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { useUserLocation } from "@/shared/platform";
import { createStore, useMapStore, useStore } from "@/shared/ui";
import { examplesFor } from "./examples";

/**
 * "Ask ZooKeeper": a campus chatbot at the top of the Activities page. The shell's section heading
 * gives it its title and the Activities icon. The conversation lives in this tab's memory only (it survives
 * switching tabs, not a reload) and the last messages go to the server with each question.
 */

interface Turn extends ChatMessage {
  cards?: ChatCard[];
  source?: ChatResponse["source"];
  fallbackReason?: ChatResponse["fallbackReason"];
}

/** Why a reply is the keyword fallback, in words the team can act on. */
const FALLBACK_REASONS: Record<NonNullable<ChatResponse["fallbackReason"]>, string> = {
  "not-configured": "Gemini isn't set up on this server (no GEMINI_API_KEY).",
  "bad-key": "Gemini rejected the API key.",
  "model-not-found": "Gemini doesn't recognise the model name in GEMINI_MODEL.",
  quota: "Gemini's usage limit was reached; try again later.",
  timeout: "Gemini took too long to answer.",
  error: "Gemini returned an error.",
  "no-answer": "Gemini didn't give a usable answer.",
};

const HISTORY_SENT = 10;
const chatStore = createStore<{ turns: Turn[]; pending: boolean; error: string | null }>({ turns: [], pending: false, error: null });

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
    chatStore.set({ turns: [...turns, { role: "assistant", text: res.reply, cards: res.cards, source: res.source, fallbackReason: res.fallbackReason }], pending: false });
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
  const example = useCyclingExample(!draft);

  const origin: ChatBody["origin"] = position ? { lat: position.lat, lng: position.lng } : selectedPlaceId ? { placeId: selectedPlaceId } : undefined;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length, pending]);

  const submit = (text: string) => {
    setDraft("");
    void send(text, origin);
  };

  return (
    <div className="flex flex-col gap-3 text-sm text-ink">
      {turns.length ? (
        <button
          type="button"
          className="zm-press self-end rounded-full bg-linen px-3 py-1 text-xs font-medium text-yale hover:bg-ash/40 hover:text-ink"
          onClick={() => chatStore.set({ turns: [], error: null })}
        >
          New chat
        </button>
      ) : null}

      <ol className={`flex flex-col gap-2.5 ${turns.length || pending ? "" : "hidden"}`} aria-live="polite">
        {turns.map((t, i) => (
          <li key={i} className={`animate-rise ${t.role === "user" ? "self-end max-w-[85%]" : "self-start w-full"}`}>
            {t.role === "user" ? (
              <div className="rounded-2xl rounded-br-md bg-gradient-to-br from-yale to-ink px-3.5 py-2 text-white shadow-sm">{t.text}</div>
            ) : (
              <div className="space-y-2">
                <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-linen px-3.5 py-2 ring-1 ring-ash/40">
                  <p className="whitespace-pre-wrap">{t.text}</p>
                  {t.source === "fallback" ? (
                    <p className="mt-1 text-[11px] text-yale">
                      Quick answer without AI. {t.fallbackReason ? FALLBACK_REASONS[t.fallbackReason] : "Gemini unavailable."}
                    </p>
                  ) : null}
                </div>
                {t.cards?.length ? (
                  <div className="space-y-1.5">
                    {t.cards.map((c) => (
                      <Card key={c.kind === "activity" ? `a-${c.activity.id}` : c.kind === "event" ? `e-${c.event.id}` : `p-${c.placeId}`} card={c} />
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </li>
        ))}
        {pending ? (
          <li className="animate-rise flex items-center gap-2 self-start rounded-2xl rounded-bl-md bg-linen px-3.5 py-2 text-yale ring-1 ring-ash/40">
            {/* three bouncing dots beside the words */}
            <span aria-hidden className="flex gap-1">
              <span className="size-1.5 animate-bounce rounded-full bg-yale/70" />
              <span className="size-1.5 animate-bounce rounded-full bg-yale/70 [animation-delay:150ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-yale/70 [animation-delay:300ms]" />
            </span>
            <span>Thinking…</span>
          </li>
        ) : null}
      </ol>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div ref={endRef} />

      <form
        className="sticky bottom-0 bg-white/90 py-1 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <div className="flex items-center gap-1 rounded-full border border-ash/70 bg-linen/50 p-1 pl-4 transition-all focus-within:border-ink/30 focus-within:bg-white focus-within:ring-2 focus-within:ring-mint/50">
          <span className="relative min-w-0 flex-1">
            <input
              type="text"
              value={draft}
              maxLength={1000}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Ask ZooKeeper"
              className="w-full bg-transparent py-1.5 outline-none"
            />
            {/* the placeholder, drawn by hand so each example can fade in */}
            {draft ? null : (
              <span key={example} aria-hidden className="animate-fade pointer-events-none absolute inset-0 truncate py-1.5 text-yale/50">
                {example}
              </span>
            )}
          </span>
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            aria-label="Send"
            className="zm-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white disabled:bg-ash"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}

const EXAMPLE_MS = 3_500;

/** One example question for the time of day, changing every few seconds while `running`. */
function useCyclingExample(running: boolean): string {
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setTick((n) => n + 1);
      setNow(new Date()); // so the list follows the clock past a boundary (morning → midday)
    }, EXAMPLE_MS);
    return () => clearInterval(id);
  }, [running]);
  const list = examplesFor(now);
  return list[tick % list.length];
}

function Card({ card }: { card: ChatCard }) {
  if (card.kind === "event") return <EventCard event={card.event} />;
  if (card.kind === "place") return <PlaceCard card={card} />;
  return <ActivityCard activity={card.activity} />;
}

const whenFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

function EventCard({ event: initial }: { event: PlannedEvent }) {
  const { selectPlace, requestRoute } = useMapStore();
  const [event, setEvent] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const full = event.capacity !== undefined && event.goingCount >= event.capacity && !event.going;

  const toggle = async () => {
    setBusy(true);
    setNote(null);
    try {
      setEvent(
        await apiFetch(`/api/planned-events/${encodeURIComponent(event.id)}/going`, {
          method: "POST",
          body: { going: !event.going },
          schema: PlannedEvent,
        }),
      );
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : null;
      setNote(code === "CAPACITY_FULL" ? "It's full" : code === "NOT_FOUND" ? "It's over or was cancelled" : code === "CONFLICT" ? "You're hosting this one" : "Could not update");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-ash/50 transition-shadow hover:shadow-md">
      <div className="truncate font-medium">{event.title}</div>
      <div className="text-xs text-yale">
        {whenFmt.format(new Date(event.startsAt))}–{timeFmt.format(new Date(event.endsAt))} · {event.placeName ?? "On campus"}
      </div>
      <div className="text-xs text-yale">
        {event.goingCount} going{event.capacity ? ` of ${event.capacity}` : ""} · {event.category}
      </div>
      {event.description ? <p className="mt-0.5 line-clamp-2 text-xs text-yale">{event.description}</p> : null}
      <div className="mt-1.5 flex items-center gap-2">
        {event.hosting ? (
          <span className="text-xs text-yale">You&apos;re hosting</span>
        ) : (
          <button
            type="button"
            disabled={busy || full}
            onClick={() => void toggle()}
            className={`zm-press rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50 ${event.going ? "border border-ash bg-ivory text-ink" : "bg-ink text-white"}`}
          >
            {event.going ? "Going ✓" : full ? "Full" : "I'm going"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            selectPlace(event.placeId);
            requestRoute(event.placeId);
          }}
          className="zm-press rounded-full border border-ash bg-white px-3 py-1 text-xs font-medium hover:bg-linen"
        >
          Route
        </button>
        {note ? <span className="text-xs text-red-700">{note}</span> : null}
      </div>
    </div>
  );
}

function PlaceCard({ card }: { card: Extract<ChatCard, { kind: "place" }> }) {
  const { selectPlace, requestRoute } = useMapStore();
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-ash/50 transition-shadow hover:shadow-md">
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
        className="shrink-0 zm-press rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white hover:bg-yale"
      >
        Route
      </button>
    </div>
  );
}

function ActivityCard({ activity: a }: { activity: Activity }) {
  const { selectPlace, requestRoute } = useMapStore();
  const [joinState, setJoinState] = useState<string | null>(null);
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
    <div className="rounded-2xl bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-ash/50 transition-shadow hover:shadow-md">
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
          className="zm-press rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white hover:bg-yale disabled:opacity-50"
        >
          {joinState === "Joined" ? "Joined" : full ? "Full" : "Join"}
        </button>
        <button
          type="button"
          onClick={() => {
            selectPlace(a.placeId);
            requestRoute(a.placeId);
          }}
          className="zm-press rounded-full border border-ash bg-white px-3 py-1 text-xs font-medium hover:bg-linen"
        >
          Route
        </button>
        {joinState && joinState !== "Joined" && joinState !== "Joining…" ? <span className="text-xs text-red-700">{joinState}</span> : null}
      </div>
    </div>
  );
}
