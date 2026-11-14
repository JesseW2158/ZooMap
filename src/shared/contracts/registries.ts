import type { EventPayload, EventType } from "./events";
import type { LedgerDraft, LedgerEntry } from "./rewards";
import type { PlaceCount } from "./density";
import type { RawEvent, ScheduleRange, ScheduleSource } from "./schedule";

/**
 * Item types for the plug-in registries. Each registry is an array in its owning
 * module; adding a plug-in is a new file plus one line in that array.
 * (Map layers and panels are React-side and are typed in `@/shared/ui/registry-types`.)
 */

/** `src/modules/density/sources/index.ts` */
export interface DensitySource {
  id: string;
  /** Counts per place at `now`. Pure given its inputs for simulated sources. */
  getCounts(now: Date): Promise<PlaceCount[]>;
}

/** What a schedule provider is handed: a stored connection with its secret already decrypted. */
export interface ProviderConnection {
  id: string;
  userId: string;
  provider: ScheduleSource;
  label: string;
  /** Feed URL (ics) or refresh token (google). Never log it or return it from an API. */
  secret: string;
}

/** `src/modules/schedule/providers/index.ts` */
export interface ScheduleProvider {
  id: ScheduleSource;
  fetchEvents(connection: ProviderConnection, range: ScheduleRange): Promise<RawEvent[]>;
}

/** Read access a reward rule gets for caps and streaks. */
export interface RewardRuleContext {
  now: Date;
  /** The user's ledger entries, oldest first, optionally since a time and/or for one rule. */
  ledgerForUser(userId: string, opts?: { since?: Date; ruleId?: string }): Promise<LedgerEntry[]>;
}

/** `src/modules/rewards/rules/index.ts`. `evaluate` is idempotent: same event, same drafts. */
export interface RewardRule<E extends EventType = EventType> {
  id: string;
  on: E;
  evaluate(event: EventPayload<E>, ctx: RewardRuleContext): Promise<LedgerDraft[]>;
}
