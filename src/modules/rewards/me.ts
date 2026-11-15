import type { RewardsMe } from "@/shared/contracts";
import { REWARDS_CONFIG } from "./config";
import { readBalance, recentEntries } from "./ledger";
import { recentRedemptions } from "./store";

/** `GET /api/rewards/me`: balance, newest ledger entries and redemptions. */
export async function getRewardsMe(userId: string): Promise<RewardsMe> {
  const [balance, entries, redemptions] = await Promise.all([
    readBalance(userId),
    recentEntries(userId, REWARDS_CONFIG.recentLimit),
    recentRedemptions(userId, REWARDS_CONFIG.recentLimit),
  ]);
  return { balance, entries, redemptions };
}
