import { PlanBody, type ProviderConnection, type ScheduleRange } from "@/shared/contracts";
import { getPlace } from "@/modules/campus";
import type { ProviderEvent } from "../ics";
import { zonedTimeToUtc } from "../time";

/** What is stored (encrypted) for a plan: the request body without `provider`. */
export type StoredPlan = Omit<PlanBody, "provider">;

export function parseStoredPlan(secret: string): StoredPlan {
  const { provider, ...rest } = PlanBody.parse({ ...JSON.parse(secret), provider: "plan" });
  void provider;
  return rest;
}

export function planTimes(p: StoredPlan): { start: Date; end: Date } {
  const [y, m, d] = p.date.split("-").map(Number);
  const [sh, sm] = p.start.split(":").map(Number);
  const [eh, em] = p.end.split(":").map(Number);
  return { start: zonedTimeToUtc(y, m, d, sh, sm), end: zonedTimeToUtc(y, m, d, eh, em) };
}

/** A one-off plan ("Study at Du Bois"), in campus local time. */
export const planProvider = {
  id: "plan" as const,
  async fetchEvents(connection: ProviderConnection, range: ScheduleRange): Promise<ProviderEvent[]> {
    const p = parseStoredPlan(connection.secret);
    const { start, end } = planTimes(p);
    if (end <= range.from || start > range.to) return [];
    const place = p.placeId ? await getPlace(p.placeId) : null;
    const locationText = [place?.aliases[0] ?? place?.name, p.room].filter(Boolean).join(" ") || undefined;
    return [{ uid: connection.id, title: p.label, start, end, locationText, placeId: p.placeId, allDay: false, deadline: false }];
  },
};
