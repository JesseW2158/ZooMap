import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity, ActivityMe, ScheduleEvent } from "@/shared/contracts";
import { withTestDb } from "@/shared/db/testing";
import { zonedTimeToUtc } from "./time";

// The inputs are swapped for fixed ones; their own tests cover them.
const state: { activities: Activity[]; events: ScheduleEvent[]; me: ActivityMe } = {
  activities: [],
  events: [],
  me: { participation: null, activity: null },
};
vi.mock("@/modules/activities", () => ({
  listActiveActivities: async () => state.activities,
  getActiveParticipation: async () => state.me,
}));
vi.mock("@/modules/schedule", () => ({
  getUpcomingEvents: async () => state.events,
}));

const { getNotifications, markAlertsRead, updateAlertSettings, getAlertSettings } = await import("./index");
const { onLedgerEntry, onParticipationStarted, onPresence } = await import("./service");

const t = withTestDb();
const local = (d: number, hh: number, mm = 0) => zonedTimeToUtc(2026, 11, d, hh, mm);

// Du Bois Library's centre is about here; the activity sits at its place.
const DUBOIS = { lat: 42.38962, lng: -72.52826 };
function activity(id: string, over: Partial<Activity> = {}): Activity {
  return {
    id,
    hostId: "host-1",
    hostName: "Host",
    title: "CICS 210 study group",
    placeId: "r4054634",
    placeName: "W.E.B. Du Bois Library",
    placeCenter: DUBOIS,
    category: "study",
    status: "active",
    startedAt: local(16, 11).toISOString(),
    participantCount: 4,
    ...over,
  };
}

beforeEach(() => {
  state.activities = [];
  state.events = [];
  state.me = { participation: null, activity: null };
});

describe("nearby alerts", () => {
  const at = local(16, 12);
  const near = { lat: DUBOIS.lat + 0.0009, lng: DUBOIS.lng }; // about 100 m north

  it("alerts once per activity inside the radius", async () => {
    state.activities = [activity("a1")];
    await onPresence({ userId: "u1", position: near, placeId: null, at });
    await onPresence({ userId: "u1", position: near, placeId: null, at: new Date(at.getTime() + 60_000) });
    const docs = await t.cols.notifications.find({ userId: "u1" }).toArray();
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe("Nearby: CICS 210 study group");
    expect(docs[0].body).toMatch(/^W\.E\.B\. Du Bois Library · 100 m away · 4 people in$/);
    expect(docs[0].placeId).toBe("r4054634");
  });

  it("stays quiet outside the radius, for full or own activities, the one you are in, and when turned off", async () => {
    const far = { lat: DUBOIS.lat + 0.005, lng: DUBOIS.lng }; // about 550 m
    state.activities = [activity("a2")];
    await onPresence({ userId: "u2", position: far, placeId: null, at });

    state.activities = [activity("full", { capacity: 4 }), activity("own", { hostId: "u2" }), activity("in")];
    state.me = { participation: null, activity: activity("in") };
    await onPresence({ userId: "u2", position: near, placeId: null, at });

    state.me = { participation: null, activity: null };
    state.activities = [activity("a3")];
    await updateAlertSettings("u2", { nearby: false });
    await onPresence({ userId: "u2", position: near, placeId: null, at });

    expect(await t.cols.notifications.countDocuments({ userId: "u2" })).toBe(0);
  });

  it("only for the categories the user picked", async () => {
    state.activities = [activity("game", { category: "sports", title: "Pickup basketball" })];
    await updateAlertSettings("u3", { nearbyCategories: ["study"] });
    await onPresence({ userId: "u3", position: near, placeId: null, at });
    expect(await t.cols.notifications.countDocuments({ userId: "u3" })).toBe(0);
  });

  it("at most three an hour", async () => {
    state.activities = ["b1", "b2", "b3", "b4"].map((id) => activity(id));
    for (let i = 0; i < 4; i++) await onPresence({ userId: "u4", position: near, placeId: null, at: new Date(at.getTime() + i * 60_000) });
    expect(await t.cols.notifications.countDocuments({ userId: "u4" })).toBe(3);
  });

  it("not during quiet hours", async () => {
    state.activities = [activity("late")];
    await onPresence({ userId: "u5", position: near, placeId: null, at: local(16, 23, 30) });
    expect(await t.cols.notifications.countDocuments({ userId: "u5" })).toBe(0);
  });
});

describe("event alerts", () => {
  it("a replayed ledger event saves one points alert", async () => {
    const e = { entryId: "entry-1", userId: "u6", delta: 42, ruleId: "time-at-activity", balanceAfter: 142 };
    await onLedgerEntry(e);
    await onLedgerEntry(e);
    const docs = await t.cols.notifications.find({ userId: "u6" }).toArray();
    expect(docs.map((d) => d.title)).toEqual(["+42 points"]);
  });

  it("tells the host someone joined, without saying who", async () => {
    state.activities = [activity("act-9", { hostId: "host-9", participantCount: 3 })];
    await onParticipationStarted({ participationId: "p-1", activityId: "act-9", userId: "guest-1", role: "guest", at: local(16, 12) });
    const doc = await t.cols.notifications.findOne({ userId: "host-9" });
    expect(doc?.title).toBe("Someone joined CICS 210 study group");
    expect(doc?.body).toBe("2 people have joined so far.");
    expect(JSON.stringify(doc)).not.toContain("guest-1");
  });
});

describe("inbox", () => {
  it("saves due alerts once, lists upcoming ones, and reads only your own", async () => {
    const now = local(16, 9, 30);
    state.events = [
      // midterm on the 19th: the 3-day reminder is due today at 9am
      { id: "exam00000000000000001", source: "ics", title: "Midterm 2", course: "MATH 132", start: local(19, 19).toISOString(), end: local(19, 21).toISOString(), placeId: "w110428293" },
      // class at 11:30: leave-by is upcoming
      { id: "class0000000000000001", source: "manual", title: "Lecture", course: "MATH 132", start: local(16, 11, 30).toISOString(), end: local(16, 12, 45).toISOString(), placeId: "w110428293", locationText: "Hasbrouck 20" },
    ];
    const first = await getNotifications("u7", now);
    await getNotifications("u7", now);
    expect(first.alerts.map((a) => a.title)).toEqual(["MATH 132 Midterm 2 in 3 days"]);
    expect(first.unread).toBe(1);
    // the next exam reminder (the 18th, 9am) is more than 24 hours away
    expect(first.upcoming.map((u) => u.kind)).toEqual(["leave-by"]);
    expect(first.upcoming[0].title).toBe("Leave by 11:18am for MATH 132 Lecture");
    expect(await t.cols.notifications.countDocuments({ userId: "u7" })).toBe(1);

    // someone else cannot mark it read
    await markAlertsRead("intruder", { ids: [first.alerts[0].id] });
    expect((await getNotifications("u7", now)).unread).toBe(1);
    await markAlertsRead("u7", { all: true });
    expect((await getNotifications("u7", now)).unread).toBe(0);
  });

  it("turning a kind off removes it from the inbox and from upcoming", async () => {
    const now = local(16, 9, 30);
    state.events = [
      { id: "exam00000000000000002", source: "ics", title: "Final Exam", start: local(19, 19).toISOString(), end: local(19, 21).toISOString() },
    ];
    await updateAlertSettings("u8", { exams: false });
    const res = await getNotifications("u8", now);
    expect(res.alerts).toEqual([]);
    expect(res.upcoming).toEqual([]);
  });

  it("holds time-based alerts while paused", async () => {
    const now = local(16, 9, 30);
    state.events = [
      { id: "exam00000000000000003", source: "ics", title: "Final Exam", start: local(19, 19).toISOString(), end: local(19, 21).toISOString() },
    ];
    await updateAlertSettings("u9", { pausedUntil: local(16, 10).toISOString() });
    expect((await getNotifications("u9", now)).alerts).toEqual([]);
    // after the pause the same alert arrives
    expect((await getNotifications("u9", local(16, 10, 5))).alerts).toHaveLength(1);
  });
});

describe("settings", () => {
  it("starts at the defaults and keeps changes", async () => {
    expect((await getAlertSettings("u10")).quietRooms).toBe(false);
    const saved = await updateAlertSettings("u10", { quietRooms: true, nearbyRadiusM: 400 });
    expect(saved.quietRooms).toBe(true);
    expect(await getAlertSettings("u10")).toMatchObject({ quietRooms: true, nearbyRadiusM: 400, exams: true });
  });
});
