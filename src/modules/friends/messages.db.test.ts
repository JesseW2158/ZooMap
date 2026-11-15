import { beforeEach, describe, expect, it } from "vitest";
import { withTestDb } from "@/shared/db/testing";
import { addFriend, countUnread, issueFriendCode, listConversations, listMessages, markConversationRead, removeFriend, sendMessage } from "./index";

const t = withTestDb();

const user = (slug: string) => ({ id: `seed-${slug}`, email: `dev.${slug}@umass.edu`, name: `${slug[0].toUpperCase()}${slug.slice(1)} Dev` });
const alex = user("alex");
const blair = user("blair");
const casey = user("casey");

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (error) {
    return (error as { code: string }).code;
  }
  return "OK";
}

async function befriend(a: typeof alex, b: typeof alex) {
  const { code } = await issueFriendCode(a, "http://localhost:3000");
  await addFriend(b, code);
}

const at = (s: number) => new Date(Date.UTC(2026, 10, 14, 12, 0, s));

beforeEach(async () => {
  await Promise.all((["users", "profiles", "friendships", "rate_limits", "messages"] as const).map((c) => t.cols[c].deleteMany({})));
  await t.cols.users.insertMany(
    [alex, blair, casey].map((u) => ({ _id: u.id, email: u.email, name: u.name, createdAt: new Date(), pointsBalance: 0, settings: { shareLocation: false } })),
  );
  await befriend(alex, blair);
});

describe("direct messages", () => {
  it("friends can message each other; the thread is oldest first", async () => {
    await sendMessage(alex.id, blair.id, "  hi  ", at(1));
    await sendMessage(blair.id, alex.id, "hey!", at(2));
    const thread = await listMessages(alex.id, blair.id);
    expect(thread.map((m) => [m.fromUserId, m.body])).toEqual([
      [alex.id, "hi"],
      [blair.id, "hey!"],
    ]);
    expect(await listMessages(blair.id, alex.id)).toEqual(thread);
  });

  it("strangers and yourself get 404", async () => {
    expect(await codeOf(sendMessage(alex.id, casey.id, "hi"))).toBe("NOT_FOUND");
    expect(await codeOf(listMessages(casey.id, alex.id))).toBe("NOT_FOUND");
    expect(await codeOf(sendMessage(alex.id, alex.id, "hi"))).toBe("NOT_FOUND");
    expect(await codeOf(markConversationRead(casey.id, alex.id))).toBe("NOT_FOUND");
  });

  it("after returns only newer messages", async () => {
    await sendMessage(alex.id, blair.id, "one", at(1));
    await sendMessage(alex.id, blair.id, "two", at(3));
    expect((await listMessages(blair.id, alex.id, at(2))).map((m) => m.body)).toEqual(["two"]);
  });

  it("counts unread per conversation and in total until read", async () => {
    await befriend(casey, alex);
    await sendMessage(blair.id, alex.id, "b1", at(1));
    await sendMessage(blair.id, alex.id, "b2", at(2));
    await sendMessage(casey.id, alex.id, "c1", at(3));
    await sendMessage(alex.id, blair.id, "mine", at(4));

    expect(await countUnread(alex.id)).toEqual({ count: 3 });
    const inbox = await listConversations(alex.id);
    expect(inbox.map((c) => [c.friend.userId, c.lastMessage.body, c.unread])).toEqual([
      [blair.id, "mine", 2],
      [casey.id, "c1", 1],
    ]);

    await markConversationRead(alex.id, blair.id, at(5));
    expect(await countUnread(alex.id)).toEqual({ count: 1 });
    const thread = await listMessages(blair.id, alex.id);
    expect(thread.find((m) => m.body === "b1")!.readAt).toBe(at(5).toISOString());
    // reading only marks what was sent to you
    expect(thread.find((m) => m.body === "mine")!.readAt).toBeNull();
    expect(await countUnread(blair.id)).toEqual({ count: 1 });
  });

  it("unfriending hides the conversation for both and blocks sending; history is kept", async () => {
    await sendMessage(blair.id, alex.id, "hello", at(1));
    await removeFriend(alex.id, blair.id);

    expect(await listConversations(alex.id)).toEqual([]);
    expect(await listConversations(blair.id)).toEqual([]);
    expect(await countUnread(alex.id)).toEqual({ count: 0 });
    expect(await codeOf(sendMessage(blair.id, alex.id, "still there?"))).toBe("NOT_FOUND");
    expect(await codeOf(listMessages(alex.id, blair.id))).toBe("NOT_FOUND");
    expect(await t.cols.messages.countDocuments({})).toBe(1);
  });

  it("rate limits sending at 30 a minute", async () => {
    const now = at(10);
    for (let i = 0; i < 30; i++) await sendMessage(alex.id, blair.id, `m${i}`, now);
    expect(await codeOf(sendMessage(alex.id, blair.id, "one too many", now))).toBe("RATE_LIMITED");
  });
});
