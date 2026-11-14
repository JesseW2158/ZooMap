import { ManualClass, type ProviderConnection, type ScheduleRange } from "@/shared/contracts";
import { getPlace } from "@/modules/campus";
import type { ProviderEvent } from "../ics";
import { localDays, zonedTimeToUtc } from "../time";

/** What is stored (encrypted) for a hand-entered class: the request body without `provider`. */
export type StoredClass = Omit<ManualClass, "provider">;

export function parseStoredClass(secret: string): StoredClass {
  const parsed = ManualClass.parse({ ...JSON.parse(secret), provider: "manual" });
  const { provider, ...rest } = parsed;
  void provider;
  return rest;
}

const DAY_LETTERS: Record<string, string> = { MO: "M", TU: "Tu", WE: "W", TH: "Th", FR: "F", SA: "Sa", SU: "Su" };
const ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
};

/** "MWF 10:10am–11:00am · ILC S131" */
export function describeClass(c: StoredClass, placeName?: string): string {
  const days = [...c.days].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).map((d) => DAY_LETTERS[d]).join("");
  const where = [placeName, c.room].filter(Boolean).join(" ");
  return `${days} ${to12h(c.start)}–${to12h(c.end)}${where ? ` · ${where}` : ""}`;
}

/** Weekly classes entered by hand, expanded into the requested range in campus local time. */
export const manualProvider = {
  id: "manual" as const,
  async fetchEvents(connection: ProviderConnection, range: ScheduleRange): Promise<ProviderEvent[]> {
    const c = parseStoredClass(connection.secret);
    const place = c.placeId ? await getPlace(c.placeId) : null;
    // "ILC S131": the short name people use, then the room
    const locationText = [place?.aliases[0] ?? place?.name, c.room].filter(Boolean).join(" ") || undefined;
    const [sh, sm] = c.start.split(":").map(Number);
    const [eh, em] = c.end.split(":").map(Number);
    const out: ProviderEvent[] = [];
    for (const day of localDays(range.from, range.to)) {
      if (!c.days.includes(day.weekday)) continue;
      const start = zonedTimeToUtc(day.y, day.m, day.d, sh, sm);
      const end = zonedTimeToUtc(day.y, day.m, day.d, eh, em);
      if (end <= range.from || start > range.to) continue;
      out.push({
        uid: `${connection.id}|${start.toISOString()}`,
        title: c.label,
        course: c.label,
        start,
        end,
        locationText,
        placeId: c.placeId,
        allDay: false,
        deadline: false,
      });
    }
    return out;
  },
};
