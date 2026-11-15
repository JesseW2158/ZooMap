"use client";

import { PlannedEventList, type PlannedEvent } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import { createStore, usePolling, useStore } from "@/shared/ui";

/** Planned events shared by the Events tab and the map layer. The layer is always mounted, so it polls. */
const store = createStore<{ events: PlannedEvent[] | null; error: string | null }>({ events: null, error: null });

export async function refreshPlanned(signal?: AbortSignal): Promise<void> {
  try {
    store.set({ events: await apiFetch("/api/planned-events", { signal, schema: PlannedEventList }), error: null });
  } catch (e) {
    if (e instanceof DOMException) return;
    store.set({ error: "Could not load events. Try again in a minute." });
  }
}

export function usePlannedPoller(): void {
  usePolling((signal) => refreshPlanned(signal), { intervalMs: 60_000 });
}

export function usePlannedFeed() {
  const events = useStore(store, (s) => s.events);
  const error = useStore(store, (s) => s.error);
  return { events, error };
}

/** Replace one event (after "I'm going"), add a new one, or drop a cancelled one. */
export const plannedActions = {
  replace(next: PlannedEvent) {
    store.set((s) => ({ events: s.events?.map((e) => (e.id === next.id ? next : e)) ?? null }));
  },
  add(created: PlannedEvent) {
    store.set((s) => ({ events: [...(s.events ?? []), created].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) }));
  },
  remove(id: string) {
    store.set((s) => ({ events: s.events?.filter((e) => e.id !== id) ?? null }));
  },
};
