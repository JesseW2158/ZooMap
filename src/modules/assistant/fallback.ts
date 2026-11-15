import type { ChatResponse, RecommendPrefs } from "@/shared/contracts";
import { rangeFromText } from "./time";
import { CardCollector, categoryFor, findPlaceTool, searchActivitiesTool, searchEventsTool, soundsLikeActivityQuery, studySpotTool, tokens, type ToolContext } from "./tools";

/**
 * Keyword answers for when Gemini is unavailable: no key, an error or a timeout. Covers what
 * the assistant is for: activities now, events later, study spots and how busy a place is.
 */

export type Intent = "help" | "thanks" | "study" | "activities" | "events" | "place";

const HELP_TEXT =
  "I can find activities happening on campus right now (try “anyone playing soccer?”), events coming up (“what can I do this weekend?”), suggest a study spot (“a quiet place to study near me”), or tell you how busy a building is (“how busy is the Du Bois Library?”).";

/** The whole message is an acknowledgement, e.g. "thanks!" or "ok cool". */
const THANKS = /^(?:(?:ok|okay|cool|great|nice|perfect|awesome|got it|thanks|thank you|thx|ty)(?: so much| a lot| again)?[\s,!.]*)+$/;

/** Phrasing that asks for something to do, even when no word names a known activity. */
const ACTIVITY_ASK = /\b(anyone|anybody|is there|are there|anything|things to do|something to do|what can i do|what to do|join|club|clubs|hang out|hosting)\b/;

/** Time words that are not part of a building's name: "how busy is the ILC right now?". */
const TIME_WORDS = /\b(right now|at the moment|currently|now|today|tonight|this (?:morning|afternoon|evening)|rn|atm)\b/gi;

/** A question about a later time, which only planned events can answer. */
const LATER = /\b(weekend|tonight|tomorrow|this week|next week|later|upcoming|coming up|events?|friday|saturday|sunday|monday|tuesday|wednesday|thursday)\b/;

const HELP = /^(hi|hello|hey|yo|help|what can you do|who are you)\b/;
const PLACE = /\b(where is|where's|how busy is|how crowded is|is .+ busy|is .+ crowded)\b/;
const GROUP = /\b(group|groups|session|sessions|buddy|buddies|people|partner|partners|together|with others)\b/;
const STUDY_SPOT = /\b(study|studying|quiet|library|focus|homework|work|read|reading|cram|spot|spots)\b/;

export function detectIntent(text: string): Intent {
  const t = text.toLowerCase().trim();
  if (THANKS.test(t)) return "thanks";
  if (HELP.test(t) && t.split(/\s+/).length <= 5) return "help";
  if (PLACE.test(t)) return "place";
  // "study group" is an activity; "a quiet place to study" is a spot
  if (STUDY_SPOT.test(t) && !GROUP.test(t)) return "study";
  if (LATER.test(t)) return "events";
  return "activities";
}

export function prefsFrom(text: string): RecommendPrefs {
  const t = text.toLowerCase();
  const prefs: RecommendPrefs = {};
  if (/\b(quiet|silent|focus|calm|peaceful)\b/.test(t)) prefs.quiet = true;
  else if (/\b(social|lively|busy|people|friends|loud)\b/.test(t)) prefs.quiet = false;
  if (/\b(close|closest|near me|nearby|short walk)\b/.test(t)) prefs.maxWalkMinutes = 10;
  if (/\b(next class|before class|between classes)\b/.test(t)) prefs.nearNextClass = true;
  return prefs;
}

/** The place name in "where is X" / "how busy is X", without time words such as "right now". */
export function placeQuery(text: string): string {
  const q = text.replace(TIME_WORDS, " ").replace(/\s+/g, " ").trim();
  const m = q.match(/(?:where is|where's|how busy is|how crowded is|is)\s+(?:the\s+)?(.+?)(?:\s+(?:busy|crowded))?\s*[?.!]*$/i);
  return (m?.[1] ?? q).trim();
}

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

export async function fallbackReply(ctx: Omit<ToolContext, "cards">, text: string): Promise<ChatResponse> {
  const cards = new CardCollector();
  const tctx: ToolContext = { ...ctx, cards };
  const intent = detectIntent(text);
  let reply: string;

  if (intent === "help") {
    reply = HELP_TEXT;
  } else if (intent === "thanks") {
    reply = "Anytime! Ask me about activities, events, study spots or how busy a building is.";
  } else if (intent === "study") {
    const res = await studySpotTool(tctx, prefsFrom(text));
    const [best, ...rest] = res.bestFirst;
    reply = best
      ? `Try ${best.name}: it is ${best.crowd} right now${best.countIsSimulated ? " (simulated count)" : ""}, ${best.walkMinutes} min away.` +
        (rest.length ? ` Also good: ${list(rest.map((s) => s.name))}.` : "")
      : "I could not find a study spot right now.";
  } else if (intent === "place") {
    const res = await findPlaceTool(tctx, { query: placeQuery(text) });
    const p = res.places[0];
    reply = p
      ? `${p.name} is ${p.crowd} right now${p.peopleNow ? `, about ${p.peopleNow} people` : ""}${p.countIsSimulated ? " (simulated count)" : ""}.`
      : "I could not find that building on the campus map.";
  } else if (intent === "events") {
    const range = rangeFromText(text, ctx.deps.now());
    const category = categoryFor(text);
    const res = await searchEventsTool(tctx, { query: text, category, from: range.from.toISOString(), to: range.to.toISOString() });
    if (res.matched) {
      const items = res.events.slice(0, 3).map((e) => `${e.title} at ${e.place}, ${e.starts}`);
      reply = `Coming up ${range.label}: ${list(items)}. Tap one to say you're going or get a route.`;
    } else {
      reply = `I could not find any planned ${category ? `${category} ` : ""}events ${range.label}. You can announce one from Events on the Calendar tab.`;
    }
  } else {
    const category = categoryFor(text);
    const res = await searchActivitiesTool(tctx, { query: text, category });
    const words = tokens(text).filter((w) => w.length > 3);
    if (res.matched) {
      const titles = res.activities.slice(0, 3).map((a) => `${a.title} at ${a.place} (${a.people} there)`);
      reply = `Happening now: ${list(titles)}. Tap one to join or get a route.`;
    } else {
      // nothing on now: anything like it coming up this week?
      const later = await searchEventsTool(tctx, { query: text, category });
      const what = category ? `${category} ` : "";
      const none = `I could not find any active ${what}activities${words.length ? ` matching “${text.trim().slice(0, 60)}”` : ""} right now.`;
      if (later.matched) reply = `${none} Coming up: ${list(later.events.slice(0, 3).map((e) => `${e.title} at ${e.place}, ${e.starts}`))}.`;
      else if (soundsLikeActivityQuery(text) || ACTIVITY_ASK.test(text.toLowerCase())) reply = `${none} You can host one from the Activities tab.`;
      // not about activities at all ("what time does the dining hall close?"): say what we can do
      else reply = `I'm not sure I can help with that. ${HELP_TEXT}`;
    }
  }

  return { reply, cards: cards.pick(reply), source: "fallback" };
}
