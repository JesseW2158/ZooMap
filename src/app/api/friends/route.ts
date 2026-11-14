import { AddFriendBody } from "@/shared/contracts";
import { apiRoute, parseBody } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { addFriend, listFriends } from "@/modules/friends";

/** GET /api/friends : your friends with full profiles. Owner: friends. */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  return listFriends(user.id);
});

/** POST /api/friends { code } : add the owner of a friend code (mutual, idempotent). Owner: friends. */
export const POST = apiRoute(async (req) => {
  const user = await requireUser(req);
  const { code } = await parseBody(req, AddFriendBody);
  return addFriend(user, code);
});
