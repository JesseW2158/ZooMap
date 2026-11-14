# Stream: chain (stretch)

**Branch:** `ws/chain`, built on `ws/rewards` (merge rewards first)
**Worktree:** `../ZooMap-chain`, `MONGODB_DB=zoomap_chain`
**Status:** working on devnet. `npm run check` is green (159 tests). Verified 2026-11-14: seed-alex earned 90 and redeemed 60, and the devnet token balance read 30 (one mint, one burn, each done in one attempt, synced in about 3 s). Not merged.

- Mint: `5QByiYyFg7z6jvtgC5kk2joCjMuH9tFhEx4czsGjjd1A` ([explorer](https://explorer.solana.com/address/5QByiYyFg7z6jvtgC5kk2joCjMuH9tFhEx4czsGjjd1A?cluster=devnet))
- Mint authority (fee payer): `DCBQotNCSvdzc6PrAk5krWfinGuRWUYsMccMKs573GaK`, funded with 0.5 devnet SOL from the faucet
- The keys live only in this worktree's `.env.local`. Copy `CHAIN_*` from there to Vercel and to any other environment that should mirror to the same token.

## What it does

MongoDB stays the source of truth. Solana devnet holds a public receipt.

- On `ledger.entry.created`, the subscriber inserts one `chain_outbox` row (unique on `ledgerEntryId`) and schedules a drain with `after()` from `next/server`. Outside a request, `after()` throws and the row waits.
- `drainOutbox` handles pending rows oldest first, strictly in order per user:
  - **Claiming:** a compare-and-set on `updatedAt`, with a 120 s lease, so two concurrent drains never both win a row.
  - **Exactly once:** the transaction's signature is saved **before** sending. A retry checks that signature first and re-sends only if it never landed. The lease outlives a blockhash, so an old transaction can no longer land after a re-send.
  - **Retries:** capped at 5 attempts, after which the row is `failed`.
- `GET /api/chain/me` drains that user's rows, then returns the address, on-chain balance, pending count and explorer link. The Points panel shows this in a small "On Solana devnet" section, hidden when the chain is off.
- With any of `CHAIN_MINT_ADDRESS`, `CHAIN_AUTHORITY_SECRET`, `CHAIN_USER_SEED` unset, the module is inert and the app behaves exactly as before.

## Design notes

- **SDK:** one line only. `@solana/kit` 8.6.0, `@solana-program/token` 0.18.0, `@solana-program/system` 0.16.0. No legacy `web3.js` or `spl-token`. Dependency commit: `chore(deps)` on this branch.
- **Token:** 0 decimals, 1 token = 1 point. The mint authority pays every fee and every token account's rent, so users never need SOL.
- **Custodial keys:** a user's private key is `HMAC-SHA256(CHAIN_USER_SEED, "zoomap:user:<userId>")`. Nothing is stored per user. Whoever has the seed controls every user's tokens, which is acceptable only because this is a devnet demo token. **Never change the seed** after use, or every address changes.
- **Burns** are signed by the user's derived key, because only a token account's owner can burn. The authority is the fee payer.
- **The panel** fetches `/api/chain/me` itself. Lint forbids a `ui/` file from importing another module's component, so the brief's "component this module exports" could not be done as written.
- **`src/app/api/routes.test.ts`**: a second small `vi.mock` keeps the contract test offline for `/api/chain/me`.
- **Divergence:** a row that reaches `failed` (for example, a burn after its mint failed for good) leaves the chain balance different from the points balance. That is visible in the panel and acceptable for a receipt.

## Setup (devnet)

```bash
npx tsx src/modules/chain/scripts/setup-devnet.ts
```

- **Keys:** creates the authority key and the user seed if missing, and appends them to `.env.local`. They are never printed.
- **Funding:** the public airdrop returned HTTP 410 on 2026-11-14, so fund the printed authority address at https://faucet.solana.com (0.5 to 1 SOL is plenty) and run the script again.
- **Mint:** the second run creates the mint and saves `CHAIN_MINT_ADDRESS`.
- Restart the dev server afterwards.

**Deploying:** the three `CHAIN_*` variables (and optionally `SOLANA_RPC_URL`) must be added to Vercel by the owner. Without them, production simply runs with the chain off.
