/**
 * Chain settings, read from the environment on every call (tests change `process.env`).
 * `src/shared/config/env.ts` is frozen, so this module reads its own variables.
 * With any of the three required values unset, the chain mirror is off and the app behaves
 * exactly as it does without it.
 */
export interface ChainConfig {
  enabled: boolean;
  rpcUrl: string;
  cluster: "devnet";
  /** Token mint address (base58). */
  mint: string | undefined;
  /** Mint authority and fee payer: base58 or a JSON byte array, 64-byte keypair or 32-byte private key. */
  authoritySecret: string | undefined;
  /** Master seed that every user's custodial key is derived from. Keep it secret and never change it. */
  userSeed: string | undefined;
}

export const DEFAULT_RPC_URL = "https://api.devnet.solana.com";

function read(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

export function chainConfig(): ChainConfig {
  const mint = read("CHAIN_MINT_ADDRESS");
  const authoritySecret = read("CHAIN_AUTHORITY_SECRET");
  const userSeed = read("CHAIN_USER_SEED");
  return {
    enabled: Boolean(mint && authoritySecret && userSeed),
    rpcUrl: read("SOLANA_RPC_URL") ?? DEFAULT_RPC_URL,
    cluster: "devnet",
    mint,
    authoritySecret,
    userSeed,
  };
}

export const OUTBOX = {
  /** A claimed row is left alone this long; longer than a devnet blockhash stays valid (~60-90 s). */
  leaseMs: 120_000,
  /** Give up on a row after this many attempts (status "failed"). */
  maxAttempts: 5,
  /** Most rows one drain call handles. */
  batchSize: 25,
  /** How long `confirm` polls a sent transaction before leaving it for the next drain. */
  confirmTimeoutMs: 30_000,
  /**
   * Cap on every single RPC call. Without it a stalled connection never settles, and the
   * deadline in `confirm` is only checked between calls.
   */
  rpcTimeoutMs: 8_000,
  /**
   * Time one `drainOutbox` call may spend in total. A drain runs inside a serverless request
   * (the wallet view, or `after()` of a points request), so it must end well inside the
   * function's time limit. Rows it does not reach stay pending for the next drain.
   */
  drainBudgetMs: 20_000,
  /** Do not start a new row with less than this left in the budget (prepare and send take a few RPC calls). */
  minRowBudgetMs: 6_000,
  /** The shortest `confirm` wait once the budget is nearly spent. */
  minConfirmMs: 2_000,
} as const;

export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}
