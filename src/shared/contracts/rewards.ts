import { z } from "zod";
import { Id, IsoTime } from "./common";

/** What a reward rule returns. Whole points; negative to spend. */
export const LedgerDraft = z.object({
  userId: Id,
  delta: z.number().int().refine((n) => n !== 0, "delta must not be zero"),
  ruleId: z.string().min(1),
  /** Shown to the user. */
  reason: z.string().min(1),
  source: z.object({ type: z.string().min(1), id: z.string().min(1) }),
  /** Unique; derived from the cause, for example `participation:<id>:time`. */
  idempotencyKey: z.string().min(1),
});
export type LedgerDraft = z.infer<typeof LedgerDraft>;

export const LedgerEntry = LedgerDraft.extend({
  id: Id,
  createdAt: IsoTime,
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;

export const StoreItem = z.object({
  id: Id,
  name: z.string(),
  description: z.string(),
  imageUrl: z.string().optional(),
  cost: z.number().int().positive(),
  stock: z.number().int().nonnegative().optional(),
});
export type StoreItem = z.infer<typeof StoreItem>;

export const Redemption = z.object({
  id: Id,
  itemId: Id,
  cost: z.number().int().positive(),
  code: z.string(),
  status: z.enum(["issued", "claimed"]),
  createdAt: IsoTime,
});
export type Redemption = z.infer<typeof Redemption>;

/** GET /api/rewards/me */
export const RewardsMe = z.object({
  balance: z.number().int(),
  entries: z.array(LedgerEntry),
  redemptions: z.array(Redemption),
});
export type RewardsMe = z.infer<typeof RewardsMe>;

/** GET /api/store/items */
export const StoreItemList = z.array(StoreItem);

/** POST /api/store/redeem (plus an `Idempotency-Key` header). */
export const RedeemBody = z.strictObject({ itemId: Id });
export type RedeemBody = z.infer<typeof RedeemBody>;
