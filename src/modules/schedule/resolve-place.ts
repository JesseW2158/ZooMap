import type { Place } from "@/shared/contracts";
import { getPlaces } from "@/modules/campus";
import { ABBREVIATIONS, LOCATION_ALIASES } from "./aliases";

/**
 * Turn free-text calendar locations ("ILC S131", "Hasbrouck Lab Add 126",
 * "Integ. Learning Center S240") into a campus place id. Checks this module's alias table
 * first, then matches place names and aliases as whole words, longest first, after
 * expanding abbreviations and dropping room numbers. Unresolved text gives undefined.
 */

export function normalizeLocation(text: string): string {
  let s = text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/[()[\],.;:/#&'’"-]/g, " ");
  for (const [re, to] of ABBREVIATIONS) s = s.replace(re, to);
  return s.replace(/\s+/g, " ").trim();
}

/** Room numbers and filler: "s131", "126", "w-11", "a301", "rm", "room", "addition". */
export function stripRooms(normalized: string): string {
  return normalized
    .split(" ")
    .filter((w) => !/^(rm|room|addition|add|floor|fl|lobby|lab|basement)$/.test(w) && !/^[a-z]{0,2}\d+[a-z]?$/.test(w))
    .join(" ");
}

type Matcher = { phrase: string; placeId: string }[];
let matcher: { places: Place[]; list: Matcher } | null = null;

function buildMatcher(places: Place[]): Matcher {
  const list: Matcher = [];
  const seen = new Set<string>();
  for (const p of places) {
    for (const raw of [p.name, ...p.aliases]) {
      const phrase = stripRooms(normalizeLocation(raw));
      // single letters and two-letter words like "cc" collide with room codes; keep them out
      if (phrase.length < 3 || seen.has(phrase)) continue;
      seen.add(phrase);
      list.push({ phrase, placeId: p.id });
    }
    // "X Hall" is often written as just "X"
    const bare = normalizeLocation(p.name).replace(/\s+(hall|building|house|laboratory|center)$/, "");
    if (bare.length >= 4 && !seen.has(bare) && bare !== normalizeLocation(p.name)) {
      seen.add(bare);
      list.push({ phrase: bare, placeId: p.id });
    }
  }
  return list.sort((a, b) => b.phrase.length - a.phrase.length || (a.phrase < b.phrase ? -1 : 1));
}

export function resolvePlaceWith(places: Place[], text: string | undefined): string | undefined {
  if (!text?.trim()) return undefined;
  if (!matcher || matcher.places !== places) matcher = { places, list: buildMatcher(places) };
  const normalized = normalizeLocation(text);
  for (const [re, placeId] of LOCATION_ALIASES) if (re.test(normalized)) return placeId;
  const padded = ` ${stripRooms(normalized)} `;
  for (const { phrase, placeId } of matcher.list) if (padded.includes(` ${phrase} `)) return placeId;
  return undefined;
}

export async function resolvePlace(text: string | undefined): Promise<string | undefined> {
  return resolvePlaceWith(await getPlaces(), text);
}
