/**
 * Example questions cycled in the empty "Ask ZooMap" search bar, chosen by the time of day on
 * campus (Amherst time, whatever the device's zone). Each one is something the assistant can
 * answer: activities, events, study spots, or how busy a place is (not opening hours).
 */

export type DayPart = "morning" | "midday" | "afternoon" | "evening" | "late";

export const EXAMPLES: Record<DayPart, readonly string[]> = {
  morning: ["early breakfast meetups", "quiet morning study spots", "coffee before class", "how busy is Worcester Dining?"],
  midday: ["lunch meetups nearby", "pickup games today", "study spots between classes", "how busy is the Campus Center?"],
  afternoon: ["quiet study spots near me", "how busy is the Du Bois Library?", "study groups this afternoon", "events later today"],
  evening: ["dinner meetups tonight", "events happening tonight", "pickup soccer this evening", "group study tonight"],
  late: ["late-night study spots", "late-night snacks", "who's still studying?", "is the library packed right now?"],
};

const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" });

/** Morning 5–11, midday 11–14, afternoon 14–17, evening 17–22, late night 22–5. */
export function dayPart(now: Date): DayPart {
  const hour = Number(hourFmt.format(now));
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "midday";
  if (hour >= 14 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "late";
}

export function examplesFor(now: Date): readonly string[] {
  return EXAMPLES[dayPart(now)];
}
