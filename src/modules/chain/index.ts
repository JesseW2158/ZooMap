import type { ChainMe } from "@/shared/contracts";
import type { ChainClient } from "./client";
import { chainConfig, explorerAddressUrl } from "./config";
import { drainOutbox, pendingCount } from "./outbox";
import { SolanaClient } from "./solana";

export { drainOutbox } from "./outbox";

/**
 * Chain module (owner: chain, stretch). Mirrors the points ledger to a token on Solana
 * devnet. MongoDB stays the source of truth; with the Solana env vars unset everything here
 * is inert and `getChainSummary` returns `enabled: false`.
 */

const INERT: ChainMe = { enabled: false, address: null, balance: 0, pendingCount: 0, explorerUrl: null };

/** The real client, or null when the chain is not configured. */
export function getChainClient(): ChainClient | null {
  const config = chainConfig();
  if (!config.enabled || !config.mint || !config.authoritySecret || !config.userSeed) return null;
  return new SolanaClient({ ...config, mint: config.mint, authoritySecret: config.authoritySecret, userSeed: config.userSeed });
}

/**
 * Address, on-chain balance, pending count and explorer link. Opening the wallet view also
 * drains this user's pending rows (there is no scheduler); a chain error never fails it.
 */
export async function getChainSummary(userId: string, client: ChainClient | null = getChainClient()): Promise<ChainMe> {
  if (!client) return INERT;
  try {
    await drainOutbox(client, { userId });
  } catch (error) {
    console.error("[chain] drain failed", error);
  }
  const address = await client.addressOf(userId);
  const [balance, pending] = await Promise.all([client.balanceOf(userId).catch(() => 0), pendingCount(userId)]);
  return { enabled: true, address, balance, pendingCount: pending, explorerUrl: explorerAddressUrl(address) };
}
