import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { getChainSummary } from "@/modules/chain";

/** GET /api/chain/me : devnet address, balance, pending count, explorer link. Stretch. Owner: chain. */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  return getChainSummary(user.id);
});
