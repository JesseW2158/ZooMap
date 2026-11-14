import { IDEMPOTENCY_HEADER, RedeemBody } from "@/shared/contracts";
import { apiRoute, parseBody, requireHeader } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { redeem } from "@/modules/rewards";

/**
 * POST /api/store/redeem : { itemId } plus an `Idempotency-Key` header. Owner: rewards.
 * 409 INSUFFICIENT_POINTS, 409 OUT_OF_STOCK, 404 NOT_FOUND; a repeated key returns the
 * first redemption and spends nothing.
 */
export const POST = apiRoute(
  async (req) => {
    const user = await requireUser(req);
    const key = requireHeader(req, IDEMPOTENCY_HEADER);
    const { itemId } = await parseBody(req, RedeemBody);
    const { redemption } = await redeem(user.id, itemId, key);
    return redemption;
  },
  { status: 201 },
);
