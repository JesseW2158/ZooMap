import { readBalance } from "./ledger";

export * as fixtures from "./fixtures";
export { applyEntry } from "./ledger";
export type { AppliedEntry } from "./ledger";
export { getRewardsMe } from "./me";
export { settleUnpaid } from "./settle";
export { listStoreItems, redeem } from "./store";
export type { RedeemResult } from "./store";
export { REWARD_RULES } from "./rules";

/**
 * Rewards module (owner: rewards). The MongoDB ledger is the source of truth;
 * `users.pointsBalance` is its cached sum and only `applyEntry` writes it.
 */
export async function getBalance(userId: string): Promise<number> {
  return readBalance(userId);
}
