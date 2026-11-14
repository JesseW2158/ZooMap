import type { EventPayload, EventType, RewardRule, RewardRuleContext } from "@/shared/contracts";
import { applyEntry, ledgerForUser, type AppliedEntry } from "./ledger";
import { REWARD_RULES } from "./rules";

/**
 * Runs every rule registered for `type` against one event and applies the drafts.
 * A failing rule is logged and skipped so it cannot block the others (README risk 6:
 * a failed award is logged, not retried).
 */
export async function runRules<K extends EventType>(
  type: K,
  event: EventPayload<K>,
  rules: RewardRule[] = REWARD_RULES,
  now: Date = new Date(),
): Promise<AppliedEntry[]> {
  const ctx: RewardRuleContext = { now, ledgerForUser };
  const applied: AppliedEntry[] = [];
  for (const rule of rules.filter((r) => r.on === type)) {
    try {
      const drafts = await (rule as RewardRule<K>).evaluate(event, ctx);
      for (const draft of drafts) applied.push(await applyEntry({ ...draft, ruleId: rule.id }, { now }));
    } catch (error) {
      console.error(`[rewards] rule "${rule.id}" failed on ${type}`, error);
    }
  }
  return applied;
}

/** Event types at least one rule listens to. */
export function ruleEventTypes(rules: RewardRule[] = REWARD_RULES): EventType[] {
  return [...new Set(rules.map((r) => r.on))];
}
