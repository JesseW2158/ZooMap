import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { issueFriendCode } from "@/modules/friends";

/** POST /api/friends/code : a fresh friend code; the previous one stops working. Owner: friends. */
export const POST = apiRoute(async (req) => {
  const user = await requireUser(req);
  return issueFriendCode(user, new URL(req.url).origin);
});
