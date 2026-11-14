import type { ChainMe } from "@/shared/contracts";

/**
 * Chain module (owner: chain, stretch). FOUNDATION STUB: reports "not enabled". The owning
 * stream mirrors the ledger to a devnet token; with the Solana env vars unset the app must
 * behave exactly as it does now, and this keeps returning `enabled: false`.
 */
export async function getChainSummary(userId: string): Promise<ChainMe> {
  // FOUNDATION STUB
  void userId;
  return { enabled: false, address: null, balance: 0, pendingCount: 0, explorerUrl: null };
}
