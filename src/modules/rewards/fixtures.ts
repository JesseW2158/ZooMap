import type { Redemption, RewardsMe, StoreItem } from "@/shared/contracts";

export const storeItemsFixture: StoreItem[] = [
  { id: "fixture-item-1", name: "UMass sticker pack", description: "Five vinyl stickers.", cost: 50 },
  { id: "fixture-item-2", name: "Dining dollars: $5", description: "Added to your card.", cost: 200, stock: 20 },
  { id: "fixture-item-3", name: "Campus Store hoodie", description: "Maroon. Limited run.", cost: 600, stock: 3 },
];

export function rewardsMeFixture(balance: number, now: Date): RewardsMe {
  return {
    balance,
    entries: [
      {
        id: "fixture-entry-1",
        userId: "seed-alex",
        delta: 42,
        ruleId: "time-at-activity",
        reason: "42 min at Calc II study group, Du Bois Library",
        source: { type: "participation", id: "fixture-participation-1" },
        idempotencyKey: "participation:fixture-participation-1:time",
        createdAt: new Date(now.getTime() - 3_600_000).toISOString(),
      },
    ],
    redemptions: [],
  };
}

export function redemptionFixture(itemId: string, now: Date): Redemption {
  const item = storeItemsFixture.find((i) => i.id === itemId) ?? storeItemsFixture[0];
  return {
    id: "fixture-redemption-1",
    itemId: item.id,
    cost: item.cost,
    code: "FIXTURE-CODE",
    status: "issued",
    createdAt: now.toISOString(),
  };
}
