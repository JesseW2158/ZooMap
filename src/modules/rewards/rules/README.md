# Reward rules

A reward rule turns a domain event into ledger drafts. Rules never write to the database: the
engine (`../engine.ts`) applies what they return through `applyEntry`, which keeps the ledger
and the cached balance in step and drops duplicates by `idempotencyKey`.

```ts
interface RewardRule<E extends EventType> {
  id: string;                     // also the ledgerEntry.ruleId
  on: E;                          // the event it listens to, e.g. "participation.ended"
  evaluate(event, ctx): Promise<LedgerDraft[]>;
}
// ctx.now, ctx.ledgerForUser(userId, { since?, ruleId? })  -> entries, oldest first
```

## Adding a rule

1. Create `rules/<your-rule>.ts` exporting a `RewardRule`.
2. Add it to `REWARD_RULES` in `rules/index.ts`. That is the only other line you touch.
   The engine subscribes to every event type a rule lists, so a rule on a new event needs
   nothing else.
3. Put any numbers in `../config.ts`.
4. Add a test: the same event applied twice must give one entry.

Rules for every rule:

- **Derive `idempotencyKey` from the cause**, never from the time or a random id:
  `participation:<id>:time`, `activity:<id>:host-bonus`, `streak:<userId>:<day>`. Replaying an
  event then pays nothing a second time.
- **Be deterministic.** Same event and same ledger, same drafts.
- **Read, never write.** Use `ctx.ledgerForUser` for caps and streaks. Rules may read shared
  collections, but must not import the activities module (the module boundary is the event).
- **Write `reason` for a person.** It appears in the Points panel as is.
- Return `[]` when nothing is owed. A thrown error is logged and skipped; other rules still run.

The shipped rule, `time-at-activity.ts`, is the worked example: a pure points function
(`timeAtActivityPoints`, unit tested) plus a thin `evaluate` that reads today's total for the
daily cap.

## Example (not built): host bonus

Pay a host 50 points when at least two guests each verified ten minutes at their activity.

```ts
// rules/host-bonus.ts
export const hostBonus: RewardRule<"activity.ended"> = {
  id: "host-bonus",
  on: "activity.ended",
  async evaluate(event) {
    const { participations } = await getCollections();
    const qualified = await participations.countDocuments({
      activityId: event.activityId,
      role: "guest",
      verifiedSeconds: { $gte: 10 * 60 },
    });
    if (qualified < 2) return [];
    return [{
      userId: event.hostId,
      delta: REWARDS_CONFIG.hostBonus.points,          // add hostBonus to config.ts
      ruleId: "host-bonus",
      reason: `Host bonus: ${qualified} guests stayed 10+ min`,
      source: { type: "activity", id: event.activityId },
      idempotencyKey: `activity:${event.activityId}:host-bonus`,
    }];
  },
};
```

Watch out: guests who are still in the activity when the host ends it get their
`participation.ended` after `activity.ended`, depending on how the activities stream settles
them. If so, listen to `participation.ended` instead and pay the host when the second
qualifying guest's participation ends (the idempotency key still makes it once per activity).

## Example (not built): daily streak

Pay 25 points the first time a user earns time points on a day that follows a day they also
earned them, so a streak of N days pays on days 2..N.

```ts
// rules/streak.ts
export const streak: RewardRule<"ledger.entry.created"> = {
  id: "streak",
  on: "ledger.entry.created",
  async evaluate(event, ctx) {
    if (event.ruleId !== TIME_AT_ACTIVITY) return [];   // ignore our own entries and spends
    const tz = REWARDS_CONFIG.timeZone;
    const today = startOfDay(ctx.now, tz);
    const yesterday = startOfDay(new Date(today.getTime() - 12 * 3_600_000), tz);
    const earned = await ctx.ledgerForUser(event.userId, { since: yesterday, ruleId: TIME_AT_ACTIVITY });
    const hadYesterday = earned.some((e) => new Date(e.createdAt) < today);
    if (!hadYesterday) return [];
    const day = today.toISOString().slice(0, 10);
    return [{
      userId: event.userId,
      delta: 25,
      ruleId: "streak",
      reason: "Streak: active two days running",
      source: { type: "streak", id: `${event.userId}:${day}` },
      idempotencyKey: `streak:${event.userId}:${day}`,
    }];
  },
};
```

`ledger.entry.created` is emitted by this module, so this rule is triggered by the points
engine itself. It must ignore its own `ruleId` (as above) or it would feed on its own entries.
