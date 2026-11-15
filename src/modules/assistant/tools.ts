import type { Activity, ActivityCategory, ChatCard, DensityResponse, LatLng, Place, PlannedEvent, RecommendBody, RecommendPrefs } from "@/shared/contracts";
import { clampRange, formatCampus } from "./time";

/**
 * The assistant's tools. Each one returns plain data for Gemini (no user ids, emails or host
 * names) and records the cards to show under the reply. Shared by the Gemini path and the
 * keyword fallback.
 */

export interface StudySpotFacts {
  placeId: string;
  name: string;
  level: number;
  count: number;
  simulated: boolean;
  walkMin: number;
  walkEstimated: boolean;
  walkToNextMin?: number;
}

export interface AssistantDeps {
  now: () => Date;
  listActivities: () => Promise<Activity[]>;
  searchPlaces: (q: string) => Promise<Place[]>;
  getDensity: () => Promise<DensityResponse>;
  pickStudySpots: (input: RecommendBody) => Promise<{ pick: { placeId: string; reason: string }; spots: StudySpotFacts[] }>;
  /** Planned events that have not ended and start by `to`, soonest first. */
  listPlannedEvents: (to: Date) => Promise<PlannedEvent[]>;
}

export const LEVEL_WORDS = ["empty", "quiet", "moderately busy", "busy", "packed"] as const;

/** Words people use for the same activity. A query word expands to its whole group. */
const SYNONYMS: string[][] = [
  ["soccer", "football", "futsal", "pickup"],
  ["basketball", "hoops", "bball"],
  ["volleyball", "volley"],
  ["frisbee", "ultimate"],
  ["tennis", "pickleball", "racquet"],
  ["run", "running", "jog", "jogging"],
  ["gym", "lift", "lifting", "workout", "weights"],
  ["yoga", "stretch", "pilates"],
  ["study", "studying", "homework", "review", "exam", "cram", "midterm", "final"],
  ["food", "eat", "lunch", "dinner", "breakfast", "pizza", "snack"],
  ["coffee", "cafe", "tea"],
  ["game", "games", "boardgame", "chess", "cards", "gaming"],
  ["music", "jam", "guitar", "sing"],
  ["code", "coding", "hackathon", "programming", "cs"],
];

const CATEGORY_WORDS: Record<ActivityCategory, string[]> = {
  sports: ["sport", "sports", "soccer", "football", "futsal", "basketball", "volleyball", "frisbee", "ultimate", "tennis", "run", "running", "gym", "workout", "yoga", "play", "pickup"],
  study: ["study", "studying", "homework", "review", "exam", "cram", "midterm", "final", "tutor"],
  food: ["food", "eat", "lunch", "dinner", "breakfast", "pizza", "snack", "coffee"],
  social: ["social", "hang", "hangout", "party", "meet", "friends", "chill", "game", "games", "music"],
  other: [],
};

const STOPWORDS = new Set(
  "a an and any are can could do does for i if im i'm in is it me my near of on or play some something the there to up wanna want what where which who with would you activity activities going happening now right today campus this weekend tonight tomorrow week next event events fun things thing umass at during coming upcoming later friday saturday sunday".split(" "),
);

export const tokens = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

function expand(words: string[]): Set<string> {
  const out = new Set<string>();
  for (const w of words) {
    out.add(w);
    for (const group of SYNONYMS) if (group.includes(w)) group.forEach((g) => out.add(g));
  }
  return out;
}

/** The category a query points at, if any word in it is a category word. */
export function categoryFor(query: string): ActivityCategory | undefined {
  const words = tokens(query);
  for (const [cat, list] of Object.entries(CATEGORY_WORDS) as [ActivityCategory, string[]][]) {
    if (words.some((w) => list.includes(w))) return cat;
  }
  return undefined;
}

/**
 * Whether a query could be asking for activities: it names a category or a known activity
 * word, or has no real words at all (a generic "what's happening?").
 */
export function soundsLikeActivityQuery(query: string): boolean {
  const words = tokens(query).filter((w) => !STOPWORDS.has(w));
  return !words.length || categoryFor(query) !== undefined || words.some((w) => SYNONYMS.some((group) => group.includes(w)));
}

interface Matchable {
  title: string;
  description?: string;
  category: ActivityCategory;
}

/**
 * Items matching the query words (with synonyms) in the title or description; when no word
 * matches, those in the category; everything when the query has no real words. Best match
 * first, then by `rank`.
 */
export function matchItems<T extends Matchable>(items: T[], query: string, category: ActivityCategory | undefined, rank: (a: T, b: T) => number): T[] {
  const words = expand(tokens(query).filter((w) => !STOPWORDS.has(w)));
  const scored = items.map((a) => {
    const title = new Set(tokens(a.title));
    const desc = new Set(tokens(a.description ?? ""));
    let s = 0;
    for (const w of words) {
      if (title.has(w)) s += 3;
      else if (desc.has(w)) s += 1;
    }
    return { a, s };
  });
  const byWord = scored.filter((x) => x.s > 0);
  const pool = byWord.length ? byWord : category ? scored.filter((x) => x.a.category === category) : words.size ? [] : scored;
  return pool.sort((x, y) => y.s - x.s || rank(x.a, y.a)).map((x) => x.a);
}

/** Activities happening now that match; the busiest first among equal matches. */
export function matchActivities(activities: Activity[], query: string, category?: ActivityCategory): Activity[] {
  return matchItems(activities, query, category, (a, b) => b.participantCount - a.participantCount);
}

const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60_000);
const clip = (s: string | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Collects the cards the tools produced this turn, keyed so repeats merge. */
export class CardCollector {
  private readonly cards = new Map<string, ChatCard>();

  add(card: ChatCard) {
    const key = card.kind === "activity" ? `a:${card.activity.id}` : card.kind === "event" ? `e:${card.event.id}` : `p:${card.placeId}`;
    if (!this.cards.has(key)) this.cards.set(key, card);
  }

  /** Cards named in the reply, in the order they were found; the first three when the reply names none. Up to four. */
  pick(reply: string): ChatCard[] {
    const all = [...this.cards.values()];
    const text = reply.toLowerCase();
    const nameOf = (c: ChatCard) => (c.kind === "activity" ? c.activity.title : c.kind === "event" ? c.event.title : c.name);
    const named = all.filter((c) => text.includes(nameOf(c).toLowerCase()));
    return (named.length ? named : all.slice(0, 3)).slice(0, 4);
  }
}

export interface ToolContext {
  deps: AssistantDeps;
  origin: RecommendBody["origin"];
  cards: CardCollector;
}

export async function searchActivitiesTool(ctx: ToolContext, args: { query?: string; category?: ActivityCategory }) {
  const now = ctx.deps.now();
  const query = args.query ?? "";
  const category = args.category ?? categoryFor(query);
  const found = matchActivities(await ctx.deps.listActivities(), query, category).slice(0, 6);
  for (const activity of found) ctx.cards.add({ kind: "activity", activity });
  return {
    matched: found.length,
    activities: found.map((a) => ({
      title: a.title,
      description: clip(a.description, 200),
      category: a.category,
      place: a.placeName ?? "a campus building",
      people: a.participantCount,
      spotsLeft: a.capacity !== undefined ? Math.max(0, a.capacity - a.participantCount) : "no limit",
      startedMinutesAgo: Math.max(0, minutesBetween(new Date(a.startedAt), now)),
      endsInMinutes: a.endsAt ? minutesBetween(now, new Date(a.endsAt)) : undefined,
    })),
  };
}

/** Planned events overlapping the range Gemini asked for (clamped), matching the query; soonest first. */
export async function searchEventsTool(ctx: ToolContext, args: { query?: string; category?: ActivityCategory; from?: unknown; to?: unknown }) {
  const range = clampRange(ctx.deps.now(), args.from, args.to);
  const query = args.query ?? "";
  const category = args.category ?? categoryFor(query);
  const inRange = (await ctx.deps.listPlannedEvents(range.to)).filter(
    (e) => Date.parse(e.startsAt) < range.to.getTime() && Date.parse(e.endsAt) > range.from.getTime(),
  );
  const found = matchItems(inRange, query, category, (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 6);
  for (const event of found) ctx.cards.add({ kind: "event", event });
  return {
    searched: range.label,
    matched: found.length,
    events: found.map((e) => ({
      title: e.title,
      description: clip(e.description, 200),
      category: e.category,
      place: e.placeName ?? "a campus building",
      starts: formatCampus(new Date(e.startsAt)),
      ends: formatCampus(new Date(e.endsAt)),
      going: e.goingCount,
      spotsLeft: e.capacity !== undefined ? Math.max(0, e.capacity - e.goingCount) : "no limit",
      studentIsGoing: e.going,
      studentIsHosting: e.hosting,
    })),
  };
}

export async function studySpotTool(ctx: ToolContext, prefs: RecommendPrefs) {
  const { pick, spots } = await ctx.deps.pickStudySpots({ origin: ctx.origin, prefs });
  for (const s of spots) {
    ctx.cards.add({ kind: "place", placeId: s.placeId, name: s.name, level: s.level, walkMin: s.walkMin, simulated: s.simulated });
  }
  return {
    bestFirst: spots.map((s) => ({
      name: s.name,
      crowd: LEVEL_WORDS[s.level],
      peopleNow: s.count,
      countIsSimulated: s.simulated,
      walkMinutes: s.walkEstimated ? `about ${Math.round(s.walkMin)}` : Math.round(s.walkMin),
      walkToNextClassMinutes: s.walkToNextMin,
    })),
    whyTheFirst: pick.reason,
  };
}

export async function findPlaceTool(ctx: ToolContext, args: { query: string }) {
  const [places, density] = await Promise.all([ctx.deps.searchPlaces(args.query), ctx.deps.getDensity()]);
  const byId = new Map(density.places.map((d) => [d.placeId, d]));
  const top = places.slice(0, 3);
  for (const p of top) {
    const d = byId.get(p.id);
    ctx.cards.add({ kind: "place", placeId: p.id, name: p.name, level: d?.level ?? 0, simulated: (d?.simulated ?? 0) > 0 });
  }
  return {
    places: top.map((p) => {
      const d = byId.get(p.id);
      return { name: p.name, aliases: p.aliases, kind: p.category, crowd: LEVEL_WORDS[d?.level ?? 0], peopleNow: d?.count ?? 0, countIsSimulated: (d?.simulated ?? 0) > 0 };
    }),
  };
}

export const DEFAULT_ORIGIN: LatLng = { lat: 42.3868, lng: -72.5301 };
