# Stream: rewards and store

**Branch:** `ws/rewards`
**Database:** `MONGODB_DB=zoomap_rewards` (tests: `zoomap_rewards_test`)
**Status:** built and committed. The database tests and the dev check are not run yet (waiting for the Atlas URI). Not merged.

## Built

- `ledger.ts`: `applyEntry` writes the append-only `ledger` entry and `users.pointsBalance` in one transaction, then emits `ledger.entry.created`. A duplicate `idempotencyKey` is success and returns the first entry. `applyEntryInSession` is the same write inside a caller's transaction (the store uses it). Nothing else writes the balance.
- `rules/`: registry (`REWARD_RULES`) and `time-at-activity` on `participation.ended`. `rules/README.md` explains how to add a rule, with host-bonus and streak examples.
- `engine.ts` + `subscribers.ts`: one bus subscription per event type a rule listens to (`rewards:rules:<type>`). A failing rule is logged and skipped (README risk 6).
- `store.ts`, `catalog.ts`, `seed.ts`: 8 mock items, seeded insert-if-missing (stock is never reset). `redeem` runs in one transaction: `stock >= 1` and `pointsBalance >= cost` are in the update filters, then the negative ledger entry and the redemption with a `ZOO-XXXX-XXXX` claim code are inserted.
- Routes: `GET /api/rewards/me`, `GET /api/store/items`, `POST /api/store/redeem`.
- `ui/Panel.tsx`: balance (polls every 10 s), recent entries, store with a confirm step, claim codes.

## Decisions and caveats for other streams

- **Idempotency-Key scope:** the client's key is stored as `<userId>:<key>`, so two users can never collide. A repeated key returns the first redemption even if `itemId` differs.
- **The daily cap uses the day points are paid** (`ctx.now`, America/New_York), not `endedAt`. The ledger buckets by `createdAt`, and settling is lazy.
- **The daily cap is not race-proof** across two `participation.ended` events for one user at the same moment. This is rare under "one activity at a time". Acceptable for the demo.
- **Reason text** ("42 min at Study group, Du Bois Library") reads `title` and `placeId` from the `activities` **collection** directly and the place name via `@/modules/campus`. It never imports the activities module. If the activity is missing, the text falls back to "an activity".
- **The activities stream** must emit `participation.ended` with the user's real id. An unknown user is NOT_FOUND inside `applyEntry`, and the engine logs and skips it.

## Open: `src/app/api/routes.test.ts` (not owned by this stream)

Foundation's contract test calls the real handlers. Now that the rewards routes use the database, its three rewards cases fail without a database. With `MONGODB_URI` set, they would hit the real dev database, not `_test`, and `storeRedeem`'s sample `fixture-item-1` is not seeded. Every database-backed stream will hit this. Proposed fix (needs the owner's OK): `vi.mock("@/modules/rewards", ...)` in that test, backed by the module's `fixtures`, so it checks wiring and shape while `rewards.db.test.ts` covers behaviour.

## Dev check: emit a fixture event

With `npm run dev` running and signed in as `seed-alex`, the in-process bus is in the server, so emit through a route or a one-off script against the same database:

```bash
npx tsx -e '
import { loadEnv } from "./scripts/load-env"; loadEnv();
const { emit } = await import("@/shared/events");
const { closeClient } = await import("@/shared/db");
const now = new Date();
await emit("participation.ended", { participationId: "dev-" + now.getTime(), activityId: "dev", userId: "seed-alex",
  role: "guest", joinedAt: new Date(now.getTime() - 30 * 60_000), endedAt: now, verifiedSeconds: 30 * 60 });
await closeClient();'
```

The Points panel shows +30 within 10 s.

## Next

- Chain mirror (`ws-chain.md`) on branch `ws/chain`, from `ws/rewards`.
