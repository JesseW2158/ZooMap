import { MessagesQuery, SendMessageBody } from "@/shared/contracts";
import { apiRoute, parseBody, parseQuery } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { listMessages, sendMessage } from "@/modules/friends";

/** GET /api/messages/:friendId?after= : the conversation, oldest first. 404 unless friends. Owner: friends. */
export const GET = apiRoute(async (req, ctx: RouteContext<"/api/messages/[id]">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const { after } = parseQuery(req, MessagesQuery);
  return listMessages(user.id, id, after ? new Date(after) : undefined);
});

/** POST /api/messages/:friendId { body } : send a message. 404 unless friends. Owner: friends. */
export const POST = apiRoute(
  async (req, ctx: RouteContext<"/api/messages/[id]">) => {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const { body } = await parseBody(req, SendMessageBody);
    return sendMessage(user.id, id, body);
  },
  { status: 201 },
);
