import { EVENT_SCHEMAS, type EventPayload, type EventType } from "@/shared/contracts";

export type EventHandler<K extends EventType> = (payload: EventPayload<K>) => Promise<void> | void;

export interface EventBusLogger {
  error(message: string, detail: unknown): void;
}

export interface EventBus {
  /**
   * Subscribe. `id` names the subscription ("rewards:time-at-activity"): registering the same
   * id for the same event again replaces the handler instead of adding a second one, so hot
   * reloads and repeated registration never double-deliver.
   */
  on<K extends EventType>(type: K, id: string, handler: EventHandler<K>): void;
  off(type: EventType, id: string): void;
  /**
   * Validates the payload against its contract (a bad payload is the emitter's bug and throws),
   * then awaits each subscriber in registration order. A subscriber's error is logged and
   * never reaches the emitter or the other subscribers.
   */
  emit<K extends EventType>(type: K, payload: EventPayload<K>): Promise<void>;
  clear(): void;
}

export function createEventBus(logger: EventBusLogger = defaultLogger): EventBus {
  const handlers = new Map<EventType, Map<string, EventHandler<never>>>();

  return {
    on(type, id, handler) {
      let forType = handlers.get(type);
      if (!forType) handlers.set(type, (forType = new Map()));
      forType.set(id, handler as EventHandler<never>);
    },
    off(type, id) {
      handlers.get(type)?.delete(id);
    },
    async emit(type, payload) {
      const parsed = EVENT_SCHEMAS[type].parse(payload) as EventPayload<typeof type>;
      for (const [id, handler] of [...(handlers.get(type) ?? [])]) {
        try {
          await (handler as EventHandler<typeof type>)(parsed);
        } catch (error) {
          logger.error(`[events] subscriber "${id}" failed on ${type}`, error);
        }
      }
    },
    clear() {
      handlers.clear();
    },
  };
}

const defaultLogger: EventBusLogger = {
  error: (message, detail) => console.error(message, detail),
};

/** One bus per server process, shared by every route bundle and surviving hot reloads. */
const globalForBus = globalThis as unknown as { __zoomapBus?: EventBus };
export const bus: EventBus = (globalForBus.__zoomapBus ??= createEventBus());
