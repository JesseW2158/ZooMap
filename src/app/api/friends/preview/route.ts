import { FriendPreviewQuery } from "@/shared/contracts";
import { apiRoute, parseQuery } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { previewFriendCode } from "@/modules/friends";

/** GET /api/friends/preview?code= : name, photo and pronouns of a code's owner. Rate limited. Owner: friends. */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  const { code } = parseQuery(req, FriendPreviewQuery);
  return previewFriendCode(user, code);
});
