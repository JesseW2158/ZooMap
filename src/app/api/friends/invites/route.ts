import { InviteBody } from "@/shared/contracts";
import { apiRoute, parseBody } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { listInvites, sendInvites } from "@/modules/friends";

/** GET /api/friends/invites : your pending activity invites. Owner: friends. */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  return listInvites(user.id);
});

/** POST /api/friends/invites { activityId, toUserIds } : invite friends to the activity you're in. Owner: friends. */
export const POST = apiRoute(async (req) => {
  const user = await requireUser(req);
  return sendInvites(user, await parseBody(req, InviteBody));
});
