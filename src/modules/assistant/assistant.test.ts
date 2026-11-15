import { describe, expect, it, vi } from "vitest";
import type { Activity, ChatBody, Place } from "@/shared/contracts";
import { ChatBody as ChatBodySchema, ChatResponse } from "@/shared/contracts";
import { detectIntent, placeQuery, prefsFrom } from "./fallback";
import type { ChatModel, ModelTurn } from "./model";
import { chatWith, studyPrefsFrom, type ChatDeps } from "./service";
import { matchActivities } from "./tools";

const NOW = new Date("2026-11-16T22:00:00Z");

const activity = (id: string, over: Partial<Activity>): Activity => ({
  id,
  hostId: `host-${id}`,
  hostName: "Secret Host",
  title: `Activity ${id}`,
  placeId: "fields",
  placeName: "Rec Fields",
  category: "other",
  status: "active",
  startedAt: "2026-11-16T21:30:00Z",
  participantCount: 3,
  ...over,
});

const ACTIVITIES: Activity[] = [
  activity("a1", { title: "Pickup football on the lawn", category: "sports", participantCount: 8, capacity: 12 }),
  activity("a2", { title: "CS 220 study group", category: "study", placeName: "W.E.B. Du Bois Library", placeId: "dubois" }),
  activity("a3", { title: "Basketball 3v3", category: "sports", description: "bring water", participantCount: 5 }),
  activity("a4", { title: "Board games night", category: "social", description: "chess and cards" }),
];

const PLACE: Place = {
  id: "dubois",
  name: "W.E.B. Du Bois Library",
  aliases: ["Du Bois"],
  category: "library",
  studyFriendly: true,
  center: { lat: 42.39, lng: -72.53 },
  entranceNodes: [0],
  heightM: 90,
};

const pickStudySpots = vi.fn<ChatDeps["pickStudySpots"]>(async () => ({
  pick: { placeId: "dubois", reason: "W.E.B. Du Bois Library is quiet right now, 6 min walk." },
  spots: [
    { placeId: "dubois", name: "W.E.B. Du Bois Library", level: 1, count: 4, simulated: true, walkMin: 6, walkEstimated: false },
    { placeId: "ilc", name: "Integrative Learning Center", level: 2, count: 15, simulated: true, walkMin: 4, walkEstimated: false },
  ],
}));

function deps(over: Partial<ChatDeps> = {}): ChatDeps {
  return {
    now: () => NOW,
    listActivities: async () => ACTIVITIES,
    searchPlaces: async (q) => (/bois|library/i.test(q) ? [PLACE] : []),
    getDensity: async () => ({
      generatedAt: NOW.toISOString(),
      hasSimulated: true,
      points: [],
      places: [{ placeId: "dubois", count: 30, live: 0, simulated: 30, level: 3 }],
    }),
    pickStudySpots,
    model: null,
    timeoutMs: 5_000,
    ...over,
  };
}

const ask = (text: string): ChatBody => ({ messages: [{ role: "user", text }] });

/** A model that plays the given turns in order. */
function scripted(...turns: Partial<ModelTurn>[]) {
  let i = 0;
  return vi.fn<ChatModel>(async () => {
    const t = turns[i++] ?? { text: "out of script" };
    return { text: t.text ?? "", calls: t.calls ?? [], content: t.content ?? { role: "model", parts: [] } };
  });
}

describe("matchActivities", () => {
  it("soccer finds football through synonyms", () => {
    expect(matchActivities(ACTIVITIES, "what activities can I do if I wanna play soccer").map((a) => a.id)).toEqual(["a1"]);
  });

  it("falls back to the category when no word matches", () => {
    expect(matchActivities(ACTIVITIES, "any sports", "sports").map((a) => a.id)).toEqual(["a1", "a3"]);
  });

  it("matches descriptions too, below titles", () => {
    expect(matchActivities(ACTIVITIES, "chess").map((a) => a.id)).toEqual(["a4"]);
  });

  it("nothing for an unrelated word", () => {
    expect(matchActivities(ACTIVITIES, "rowing")).toEqual([]);
  });

  it("everything for an empty query, busiest first", () => {
    expect(matchActivities(ACTIVITIES, "")[0].id).toBe("a1");
  });
});

describe("fallback intent", () => {
  it.each([
    ["what activities can I do if I wanna play soccer", "activities"],
    ["is anyone in a study group?", "activities"],
    ["best study spots?", "study"],
    ["a quiet place to study near me", "study"],
    ["how busy is the Du Bois Library?", "place"],
    ["hi", "help"],
  ] as const)("%s -> %s", (text, intent) => {
    expect(detectIntent(text)).toBe(intent);
  });

  it("reads preferences from the words", () => {
    expect(prefsFrom("a quiet spot near me")).toEqual({ quiet: true, maxWalkMinutes: 10 });
    expect(prefsFrom("somewhere lively before class")).toEqual({ quiet: false, nearNextClass: true });
  });

  it("pulls the building out of a place question", () => {
    expect(placeQuery("How busy is the Du Bois Library?")).toBe("Du Bois Library");
  });
});

describe("chatWith without Gemini", () => {
  it("answers a soccer question with the matching activity card", async () => {
    const res = await chatWith(deps(), ask("what activities can I do if I wanna play soccer"));
    expect(ChatResponse.parse(res)).toBeTruthy();
    expect(res.source).toBe("fallback");
    expect(res.reply).toContain("Pickup football on the lawn");
    expect(res.cards).toEqual([{ kind: "activity", activity: ACTIVITIES[0] }]);
  });

  it("says so when nothing matches", async () => {
    const res = await chatWith(deps(), ask("anyone rowing?"));
    expect(res.reply).toMatch(/could not find any active/);
    expect(res.cards).toEqual([]);
  });

  it("answers a study-spot question with place cards", async () => {
    const res = await chatWith(deps(), ask("best study spots near me?"));
    expect(res.reply).toContain("W.E.B. Du Bois Library");
    expect(res.reply).toContain("simulated");
    expect(res.cards.map((c) => c.kind === "place" && c.placeId)).toEqual(["dubois", "ilc"]);
    expect(pickStudySpots).toHaveBeenLastCalledWith({ origin: { lat: 42.3868, lng: -72.5301 }, prefs: { maxWalkMinutes: 10 } });
  });

  it("answers how busy a place is", async () => {
    const res = await chatWith(deps(), ask("how busy is the Du Bois Library?"));
    expect(res.reply).toMatch(/W\.E\.B\. Du Bois Library is busy right now, about 30 people \(simulated count\)/);
  });
});

describe("chatWith with Gemini (scripted)", () => {
  it("runs the tool Gemini asks for and shows cards for what the reply names", async () => {
    const model = scripted(
      { calls: [{ id: "c1", name: "search_activities", args: { query: "soccer" } }], content: { role: "model", parts: [{ functionCall: { id: "c1", name: "search_activities", args: { query: "soccer" } } }] } },
      { text: "Pickup football on the lawn is on at Rec Fields with 8 people and 4 spots left." },
    );
    const res = await chatWith(deps({ model }), ask("I wanna play soccer"));
    expect(res).toMatchObject({ source: "gemini", reply: expect.stringContaining("Pickup football") });
    expect(res.cards).toEqual([{ kind: "activity", activity: ACTIVITIES[0] }]);

    // second call carries the tool result, without host names or ids
    const second = model.mock.calls[1][0];
    const response = second.contents.at(-1)!.parts[0].functionResponse!;
    expect(response).toMatchObject({ id: "c1", name: "search_activities" });
    const sent = JSON.stringify(second.contents);
    expect(sent).toContain("Pickup football on the lawn");
    expect(sent).not.toContain("Secret Host");
    expect(sent).not.toContain("host-a1");
  });

  it("passes only sane study-spot arguments", async () => {
    expect(studyPrefsFrom({ quiet: "yes", maxWalkMinutes: 500, minutesAvailable: 30, nearNextClass: true, extra: 1 })).toEqual({
      maxWalkMinutes: 60,
      minutesAvailable: 30,
      nearNextClass: true,
    });
  });

  it("an unknown tool is reported back to the model, not thrown", async () => {
    const model = scripted({ calls: [{ name: "drop_tables", args: {} }] }, { text: "Sorry, I can help with activities and study spots." });
    const res = await chatWith(deps({ model }), ask("hi"));
    expect(res.source).toBe("gemini");
    expect(JSON.stringify(model.mock.calls[1][0].contents)).toContain("unknown tool drop_tables");
  });

  it("falls back when Gemini errors", async () => {
    const model = vi.fn<ChatModel>(async () => {
      throw new Error("503");
    });
    const res = await chatWith(deps({ model }), ask("I wanna play soccer"));
    expect(res.source).toBe("fallback");
    expect(res.cards).toHaveLength(1);
  });

  it("falls back on a timeout", async () => {
    const model = vi.fn<ChatModel>(() => new Promise(() => {}));
    const started = Date.now();
    const res = await chatWith(deps({ model, timeoutMs: 30 }), ask("best study spots"));
    expect(res.source).toBe("fallback");
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("falls back when Gemini keeps calling tools", async () => {
    const call = { calls: [{ name: "find_place", args: { query: "Du Bois" } }] };
    const model = scripted(call, call, call, call, call);
    const res = await chatWith(deps({ model }), ask("how busy is Du Bois?"));
    expect(res.source).toBe("fallback");
    // the last round offers no tools
    expect(model.mock.calls.at(-1)![0].tools).toEqual([]);
  });

  it("an empty reply falls back", async () => {
    const res = await chatWith(deps({ model: scripted({ text: "  " }) }), ask("hi"));
    expect(res.source).toBe("fallback");
  });
});

describe("ChatBody", () => {
  it("needs the last message to be the user's", () => {
    expect(ChatBodySchema.safeParse({ messages: [{ role: "assistant", text: "hi" }] }).success).toBe(false);
    expect(ChatBodySchema.safeParse({ messages: [{ role: "user", text: "hi" }] }).success).toBe(true);
  });
});
