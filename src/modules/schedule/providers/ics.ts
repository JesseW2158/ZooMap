import type { ProviderConnection, ScheduleRange } from "@/shared/contracts";
import { env } from "@/shared/config/env";
import { parseFeed, type ProviderEvent } from "../ics";
import { fetchFeed } from "../safe-fetch";

/** A calendar feed link: Canvas ("Calendar Feed") or Google Calendar's secret iCal address. */
export const icsProvider = {
  id: "ics" as const,
  async fetchEvents(connection: ProviderConnection, range: ScheduleRange): Promise<ProviderEvent[]> {
    const body = await fetchFeed(connection.secret, env().icsAllowedHosts);
    const isCanvas = /\.instructure\.com\//i.test(connection.secret);
    return parseFeed(body, range, { deadlines: isCanvas });
  },
};
