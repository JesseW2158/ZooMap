export * as fixtures from "./fixtures";

/**
 * Rewards module (owner: rewards). FOUNDATION STUB: a made-up balance. The owning stream
 * reads `users.pointsBalance`; the signature stays. Only the stream's `applyEntry` ever
 * writes a balance.
 */
export async function getBalance(userId: string): Promise<number> {
  // FOUNDATION STUB
  void userId;
  return 120;
}
