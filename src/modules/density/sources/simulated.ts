import type { DensitySource, Place, PlaceCategory, PlaceCount } from "@/shared/contracts";
import { getPlaces } from "@/modules/campus";
import { capacityOf } from "../capacity";

/**
 * Simulated crowd. A pure function of (place, category, five-minute bucket): the same
 * inputs always give the same counts, so there is nothing to tick forward on Vercel.
 * Hour and weekday are read in America/New_York because the server runs in UTC.
 */

export const BUCKET_MS = 5 * 60_000;

const NY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "numeric",
  weekday: "short",
  hourCycle: "h23",
});

export interface LocalClock {
  /** Hours since local midnight, with minutes as a fraction. */
  hour: number;
  minute: number;
  weekday: boolean;
}

export function localClock(at: Date): LocalClock {
  const parts = Object.fromEntries(NY.formatToParts(at).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return { hour: hour + minute / 60, minute, weekday: !["Sat", "Sun"].includes(parts.weekday) };
}

const bump = (x: number, centre: number, width: number) => Math.exp(-(((x - centre) / width) ** 2));

/** 0..1 busyness for a category at a local time. */
export function busyness(category: PlaceCategory, clock: LocalClock): number {
  const { hour, minute, weekday } = clock;
  switch (category) {
    case "academic": {
      if (!weekday) return 0.04;
      if (hour < 8.5 || hour >= 17.5) return 0.04;
      // classes change on the hour: the crowd peaks just after it and thins through the hour
      const afterHour = Math.max(0, 1 - minute / 40);
      const inWindow = hour >= 9 && hour < 17 ? 1 : 0.4;
      return (0.3 + 0.7 * afterHour) * inWindow;
    }
    case "dining":
      return Math.min(1, 0.04 + 0.6 * bump(hour, 8.25, 1) + bump(hour, 12.5, 1.2) + 0.9 * bump(hour, 18, 1.3));
    case "library": {
      const day = hour >= 9 && hour < 17 ? 0.3 : 0;
      return Math.min(1, 0.05 + day + (weekday ? 1 : 0.7) * bump(hour, 20, 3));
    }
    case "residence": {
      const night = bump(hour, 2, 5) + bump(hour - 24, 2, 5);
      return Math.min(1, 0.25 + 0.75 * Math.min(1, night) + 0.15 * bump(hour, 21, 2));
    }
    case "athletic":
      return Math.min(1, 0.05 + 0.7 * bump(hour, 17.5, 1.8) + 0.5 * bump(hour, 7, 1));
    case "student_life":
      return Math.min(1, 0.05 + (weekday ? 0.8 : 0.3) * bump(hour, 14, 3));
    default:
      return weekday && hour >= 8 && hour < 18 ? 0.3 : 0.1;
  }
}

/** FNV-1a with a finaliser, mapped to [0, 1). */
function hash01(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 2 ** 32;
}

export function simulatedCount(place: Pick<Place, "id" | "category">, at: Date): number {
  const bucket = Math.floor(at.getTime() / BUCKET_MS);
  // each place has its own popularity and wobbles a little per bucket
  const popularity = 0.4 + 0.65 * hash01(`pop:${place.id}`);
  const wobble = 0.9 + 0.2 * hash01(`${place.id}:${bucket}`);
  const clock = localClock(new Date(bucket * BUCKET_MS));
  return Math.max(0, Math.round(capacityOf(place) * busyness(place.category, clock) * popularity * wobble));
}

export function simulatedCounts(places: Pick<Place, "id" | "category">[], at: Date): PlaceCount[] {
  return places.map((p) => ({ placeId: p.id, count: simulatedCount(p, at) }));
}

export const simulatedSource: DensitySource = {
  id: "simulated",
  async getCounts(now) {
    return simulatedCounts(await getPlaces(), now);
  },
};
