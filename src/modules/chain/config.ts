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
} as const;

export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}
