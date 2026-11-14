import type { ProviderConnection, ScheduleRange } from "@/shared/contracts";
import { fetchGoogleEvents } from "../google";
import { splitCourse, type ProviderEvent } from "../ics";

/** The user's primary Google Calendar, through the calendar-only OAuth connection. */
export const googleProvider = {
  id: "google" as const,
  async fetchEvents(connection: ProviderConnection, range: ScheduleRange): Promise<ProviderEvent[]> {
    const items = await fetchGoogleEvents(connection.secret, range.from, range.to);
    const out: ProviderEvent[] = [];
    for (const e of items) {
      const allDay = !e.start?.dateTime && !!e.start?.date;
      const start = new Date(e.start?.dateTime ?? `${e.start?.date}T00:00:00Z`);
      const end = new Date(e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00Z` : start.toISOString()));
      if (Number.isNaN(start.getTime())) continue;
      const { title, course } = splitCourse(e.summary?.trim() || "Busy");
      out.push({ uid: e.id, title, course, start, end, locationText: e.location?.trim() || undefined, allDay, deadline: false });
    }
    return out;
  },
};
