# Workstream: rewards and store

The points ledger, the rules that award points, and the mock store. Built so new gamification is a new rule file.

**Owns:** `src/modules/rewards/**`, `src/app/api/rewards/**`, `src/app/api/store/**`.
**Provides:** `getBalance`, `ledger.entry.created`, `redemption.created`, the rewards panel.
**Consumes:** activity and participation events. Build and test against fixture events; this stream never imports the activities module.

## Ledger

- `ledger` is append-only. Every entry has an `idempotencyKey`, unique, derived from its cause (`participation:<id>:time`), so replaying an event awards nothing twice.
- `users.pointsBalance` is a cache of the ledger sum. **One function, `applyEntry`, writes both in a transaction** and emits `ledger.entry.created`. Nothing else touches the balance.
- A duplicate key is success, returning the existing entry.

## Rules engine

A rule is `{ id, on, evaluate(event, ctx) }` returning a promise of ledger drafts; `ctx` gives read access to the user's ledger for caps. The module's `subscribers.ts` routes each event to the rules registered for it and applies the drafts.

Ship one rule, `time-at-activity`, on `participation.ended`: `floor(verifiedSeconds / 60) x POINTS_PER_MINUTE`, capped at 240 per participation and 600 per user per calendar day (America/New_York). Keep the numbers in one config file.

Write `rules/README.md` showing how to add a rule, with two unbuilt examples: a host bonus when at least two guests each verified ten minutes, and a streak for consecutive days. That file is the open end the owner asked for.

## Store

- `seed.ts` adds about eight UMass-themed mock items with costs that make sense against the caps.
- `POST /api/store/redeem` requires an `Idempotency-Key` header. In one transaction: decrement the balance **with the condition `pointsBalance >= cost` in the update filter**, decrement `stock` the same way when it is set, append the negative ledger entry, insert the redemption with a random claim code. No matched user means 409 `INSUFFICIENT_POINTS`. A repeated key returns the first redemption.

## Client

A panel with the balance, recent ledger entries in plain words ("42 min at Study group, Du Bois Library"), the catalog, a redeem confirmation, and the user's claim codes.

## Done when

- Tests cover: the same event applied twice yields one entry; both caps; twenty concurrent redemptions against a balance that affords one yield exactly one redemption and a non-negative balance; balance always equals the ledger sum.
- Emitting a fixture `participation.ended` in dev raises the balance in the panel.
- `npm run check` passes.

## Stretch

Leaderboard; badges as a second kind of rule output.
