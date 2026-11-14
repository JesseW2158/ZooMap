import { IDEMPOTENCY_HEADER, RedeemBody } from "@/shared/contracts";
import { apiRoute, parseBody, requireHeader } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { fixtures } from "@/modules/rewards";

/**
 * POST /api/store/redeem : { itemId } plus an `Idempotency-Key` header. Owner: rewards.
 * FOUNDATION STUB: spends nothing. Real errors: 409 INSUFFICIENT_POINTS, 409 OUT_OF_STOCK;
 * a repeated key returns the first redemption.
 */
export const POST = apiRoute(
  async (req) => {
    await requireUser(req);
    requireHeader(req, IDEMPOTENCY_HEADER);
    const { itemId } = await parseBody(req, RedeemBody);
    return fixtures.redemptionFixture(itemId, new Date());
  },
  { status: 201 },
);
