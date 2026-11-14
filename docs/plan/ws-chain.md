# Workstream: chain (stretch)

Mirrors the points ledger to a token on Solana devnet. Start only after rewards has merged and the must-have streams are on track.

**Owns:** `src/modules/chain/**`, `src/app/api/chain/**`.
**Consumes:** `ledger.entry.created`.
**May add dependencies:** Solana packages, as a commit touching only `package.json` and the lockfile. On 2026-11-14 `@solana/kit` was 8.6.2, and `@solana/spl-token` 0.4.15 still paired with the legacy `@solana/web3.js` 1.x line. Read current Solana docs and pick one line; do not mix them.

## Design

- **MongoDB stays the source of truth.** The token is a public receipt. A chain failure never fails, slows or reverses a points operation.
- One token mint on **devnet**, created by a setup script; the mint authority key lives in an env var. Mainnet is out of scope.
- Each user gets a custodial address derived on the server from a master seed and the user id, so there is no wallet to connect and no keys to store per user.
- On `ledger.entry.created`, write a row to a `chain_outbox` collection (unique on the ledger entry id) and return. A sync function drains the outbox: mint for positive deltas, burn for negative, record the transaction signature, retry failures with a cap. Run it after the response and when the wallet view is opened; there is no scheduler.
- `GET /api/chain/me` returns the address, the on-chain balance, the pending count and an explorer link. Show these in a small section of the rewards panel through a component this module exports.

## Done when

- Tests cover: one outbox row per ledger entry under replay; a failing chain call leaves the ledger and balance untouched and the row pending.
- Earning and redeeming in dev changes the devnet token balance to match, visible in an explorer.
- With the Solana env vars unset, the app behaves exactly as before.
- `npm run check` passes.
