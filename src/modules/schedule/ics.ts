import ical, { type VEvent } from "node-ical";
import type { ScheduleRange } from "@/shared/contracts";

/** A calendar event as the providers hand it on, before place resolution. */
export interface ProviderEvent {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  locationText?: string;
  allDay: boolean;
  deadline: boolean;
  course?: string;
  /** Set by providers that already know the building (hand-entered classes). */
  placeId?: string;
}

/** Caps so a hostile or huge feed cannot make expansion unbounded. */
const MAX_PERIODS_PER_EVENT = 2_000;
const MAX_INSTANCES = 5_000;

const text = (v: unknown): string | undefined => {
  if (typeof v === "string") return v.trim() || undefined;
  if (v && typeof v === "object" && "val" in v) return text((v as { val: unknown }).val);
  return undefined;
};

/** A date-only value as midnight UTC of that calendar date, wherever the server runs. */
const utcMidnight = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

/** "Lab 2 [CICS 210 (171644) FA26]" -> { title: "Lab 2", course: "CICS 210" } (Canvas's format). */
export function splitCourse(title: string): { title: string; course?: string } {
  const m = /^(.*?)\s*\[([A-Z][A-Za-z&-]*\s+\d{2,3}[A-Z0-9]{0,6})\b[^\]]*\]\s*$/.exec(title);
  return m ? { title: m[1].trim() || title, course: m[2] } : { title };
}

/**
 * Parse an iCalendar feed and return the instances that overlap `range`, with recurring
 * events expanded (RRULE, EXDATE and RECURRENCE-ID overrides) in their own time zones.
 * `deadlines`: treat all-day and zero-length events as things due (true for Canvas).
 */
export function parseFeed(body: string, range: ScheduleRange, opts: { deadlines?: boolean } = {}): ProviderEvent[] {
  const data = ical.sync.parseICS(body);
  const out: ProviderEvent[] = [];
  // look back a day so all-day events (stored at local midnight) on the first day are kept
  const from = new Date(range.from.getTime() - 86_400_000);
  for (const component of Object.values(data)) {
    if (!component || (component as { type?: string }).type !== "VEVENT") continue;
    const ev = component as VEvent;
    if (ev.status === "CANCELLED" || !ev.start) continue;
    let instances;
    try {
      instances = ical.expandRecurringEvent(ev, { from, to: range.to, expandOngoing: true, maxIterations: MAX_PERIODS_PER_EVENT });
    } catch {
      continue;
    }
    for (const inst of instances) {
      const allDay = inst.isFullDay || inst.start.dateOnly === true;
      const start = allDay ? utcMidnight(inst.start) : new Date(inst.start);
      const end = allDay ? (inst.end ? utcMidnight(inst.end) : new Date(start.getTime() + 86_400_000)) : new Date(inst.end ?? inst.start);
      const zeroLength = end.getTime() <= start.getTime();
      const endForOverlap = zeroLength ? start : end;
      if (endForOverlap < range.from || start > range.to) continue;
      const { title, course } = splitCourse(text(inst.summary) ?? text(ev.summary) ?? "Untitled event");
      out.push({
        uid: `${ev.uid ?? title}|${start.toISOString()}`,
        title,
        course,
        start,
        end: zeroLength ? start : end,
        locationText: text(inst.event?.location ?? ev.location),
        allDay,
        deadline: !!opts.deadlines && (allDay || zeroLength),
      });
      if (out.length >= MAX_INSTANCES) break;
    }
    if (out.length >= MAX_INSTANCES) break;
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}
