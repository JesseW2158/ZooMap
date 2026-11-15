import type { NotificationsResponse } from "@/shared/contracts";
import { DEFAULT_SETTINGS } from "./settings";

/** A believable inbox for route tests and UI work. */
export function notificationsFixture(now: Date): NotificationsResponse {
  const at = (min: number) => new Date(now.getTime() + min * 60_000).toISOString();
  return {
    alerts: [
      { id: "fixture:nearby:1", kind: "nearby", title: "Nearby: Pickup basketball", body: "Recreation Center · 120 m away · 6 people in", at: at(-3), read: false, placeId: "w51650200" },
      { id: "fixture:exam:1", kind: "exam", title: "MATH 132 Midterm 2 in 3 days", body: "Thursday, Nov 19, 7:00pm · Hasbrouck 20", at: at(-60), read: true, placeId: "w110428293" },
    ],
    unread: 1,
    upcoming: [
      { id: "fixture:leave-by:1", kind: "leave-by", title: "Leave by 9:58am for CICS 210", body: "ILC S131 at 10:10am · 8 min walk", fireAt: at(30), placeId: "w292876549" },
    ],
    settings: DEFAULT_SETTINGS,
  };
}
