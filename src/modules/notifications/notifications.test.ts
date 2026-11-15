import { describe, expect, it } from "vitest";
import type { Activity, ScheduleEvent } from "@/shared/contracts";
import { classifyTitle } from "./classify";
import { bigEventAlerts, leaveByAlerts, quietRoomAlerts, workAlerts, type StudySpot, type WalkMinutes } from "./producers";
import { DEFAULT_SETTINGS, mayAlert } from "./settings";
import { clock, inQuietHours, zonedTimeToUtc } from "./time";

/** Campus local time, November 2026 (EST, UTC-5). */
const local = (d: number, hh: number, mm = 0) => zonedTimeToUtc(2026, 11, d, hh, mm);
const iso = (d: number, hh: number, mm = 0) => local(d, hh, mm).toISOString();

let n = 0;
function ev(partial: Partial<ScheduleEvent> & Pick<ScheduleEvent, "title" | "start" | "end">): ScheduleEvent {
  return { id: `evt${String(++n).padStart(17, "0")}`, source: "manual", ...partial };
}

describe("classifyTitle", () => {
  const cases: [string, boolean, ReturnType<typeof classifyTitle>][] = [
    ["Midterm 2 [MATH 132]", false, "exam"],
    ["MATH 132 Mid-term Exam", false, "exam"],
    ["Final Exam", false, "exam"],
    ["CICS 210 Final", false, "exam"],
    ["Prelim 1", false, "exam"],
    ["Unit Test 3", false, "exam"],
    ["Reading Quiz 4", true, "quiz"],
    ["Weekly quizzes", true, "quiz"],
    ["Final Project Proposal", true, "project"],
    ["Research Paper Draft", true, "project"],
    ["Group Presentation", false, "project"],
    ["Lab Report 5", true, "project"],
    ["Portfolio submission", true, "project"],
    ["HW 7", true, "assignment"],
    ["Problem Set 3", true, "assignment"],
    ["Exam review session", false, null],
    ["Practice exam", true, "assignment"],
    ["Unit testing lab", true, "assignment"],
    ["Test-driven development reading", true, "assignment"],
    ["CICS 210 Lecture", false, null],
  ];
  it.each(cases)("%s", (title, deadline, kind) => {
    expect(classifyTitle(title, deadline)).toBe(kind);
  });
});

describe("time helpers", () => {
  it("formats campus clock times", () => {
    expect(clock(local(16, 9, 58))).toBe("9:58am");
    expect(clock(local(16, 13, 5))).toBe("1:05pm");
    expect(clock(local(16, 0, 0))).toBe("12:00am");
  });

  it("quiet hours wrap past midnight", () => {
    const q = { start: "23:00", end: "07:00" };
    expect(inQuietHours(local(16, 23, 30), q)).toBe(true);
    expect(inQuietHours(local(16, 6, 59), q)).toBe(true);
    expect(inQuietHours(local(16, 7, 0), q)).toBe(false);
    expect(inQuietHours(local(16, 12, 0), q)).toBe(false);
    expect(inQuietHours(local(16, 12, 0), null)).toBe(false);
    expect(inQuietHours(local(16, 13, 0), { start: "12:00", end: "14:00" })).toBe(true);
  });
});

describe("workAlerts", () => {
  const now = local(10, 12);

  it("counts down to an exam: 7, 3 and 1 days before at 9am, and 2 hours before", () => {
    const exam = ev({ title: "Midterm 2", course: "MATH 132", start: iso(19, 19), end: iso(19, 21), locationText: "Hasbrouck 20", placeId: "w110428293" });
    const out = workAlerts([exam], now);
    expect(out.map((c) => c.key.split(":").at(-1))).toEqual(["7d", "3d", "1d", "2h"]);
    expect(out[0].fireAt).toEqual(local(12, 9));
    expect(out[1].fireAt).toEqual(local(16, 9));
    expect(out[1].title).toBe("MATH 132 Midterm 2 in 3 days");
    expect(out[1].body).toBe("Thursday, Nov 19, 7:00pm · Hasbrouck 20");
    expect(out[2].title).toBe("MATH 132 Midterm 2 tomorrow");
    expect(out[3].fireAt).toEqual(local(19, 17));
    expect(out.every((c) => c.kind === "exam" && c.placeId === "w110428293")).toBe(true);
  });

  it("does not repeat the course when the title already has it", () => {
    const exam = ev({ title: "MATH 132 Final", course: "MATH 132", start: iso(19, 19), end: iso(19, 21) });
    expect(workAlerts([exam], now)[0].title).toBe("MATH 132 Final in 7 days");
  });

  it("projects get 3 days and 1 day; plain deadlines the day before, with no route", () => {
    const project = ev({ title: "Final Project", course: "CICS 210", start: iso(20, 23, 59), end: iso(20, 23, 59), deadline: true });
    const hw = ev({ title: "HW 7", start: iso(14, 23, 59), end: iso(14, 23, 59), deadline: true, placeId: "x" });
    const out = workAlerts([project, hw], now);
    expect(out.filter((c) => c.kind === "project").map((c) => c.key.split(":").at(-1))).toEqual(["3d", "1d"]);
    const due = out.find((c) => c.kind === "assignment")!;
    expect(due.title).toBe("HW 7 is due tomorrow");
    expect(due.body).toBe("Due Saturday, Nov 14, 11:59pm");
    expect(due.placeId).toBeUndefined();
  });

  it("skips past, skipped and non-work events, and reminders that would land after the start", () => {
    const past = ev({ title: "Midterm 1", start: iso(9, 10), end: iso(9, 11) });
    const skipped = ev({ title: "Quiz 3", start: iso(14, 10), end: iso(14, 11), skipped: true });
    const lecture = ev({ title: "CICS 210 Lecture", start: iso(11, 10), end: iso(11, 11) });
    // tomorrow 8am: the "1 day before at 9am" reminder is today 9am, already before now but still before the start
    const early = ev({ title: "Quiz 4", start: iso(11, 8), end: iso(11, 9) });
    const out = workAlerts([past, skipped, lecture, early], now);
    expect(out.map((c) => c.key)).toEqual([`exam:${early.id}:1d`]);
  });

  it("all-day exams use their calendar date", () => {
    const exam = ev({ title: "Final Exam", start: "2026-11-20T00:00:00.000Z", end: "2026-11-21T00:00:00.000Z", allDay: true });
    const out = workAlerts([exam], now);
    expect(out.map((c) => c.key.split(":").at(-1))).toEqual(["7d", "3d", "1d"]);
    expect(out[2].fireAt).toEqual(local(19, 9));
    expect(out[2].body).toBe("Friday, Nov 20");
  });
});

describe("leaveByAlerts", () => {
  const ILC = "w292876549";
  const LGRC = "w122196721";
  const walk: WalkMinutes = async (a, b) => (a === b ? 0 : 7.6);

  it("times the reminder from the walk after the previous class", async () => {
    const a = ev({ title: "CICS 210 Lecture", course: "CICS 210", start: iso(16, 10, 10), end: iso(16, 11), placeId: ILC, locationText: "ILC S131" });
    const b = ev({ title: "Discussion", course: "CICS 210", start: iso(16, 11, 30), end: iso(16, 12, 20), placeId: LGRC, locationText: "LGRC A301" });
    const out = await leaveByAlerts([b, a], local(16, 8), 5, walk);
    expect(out).toHaveLength(2);
    const second = out.find((c) => c.key === `leave-by:${b.id}`)!;
    // 11:30 - 8 min walk - 2 min = 11:20, warned 5 min early
    expect(second.title).toBe("Leave by 11:20am for CICS 210 Discussion");
    expect(second.fireAt).toEqual(local(16, 11, 15));
    expect(second.body).toBe("LGRC A301 at 11:30am · 8 min walk from CICS 210");
    expect(second.staleAt).toEqual(local(16, 11, 30));
    // the first class of the day has no previous stop: a 10 minute guess
    const first = out.find((c) => c.key === `leave-by:${a.id}`)!;
    expect(first.body).toContain("about 10 min walk");
  });

  it("skips skipped classes, back-to-back classes in the same building and deadlines", async () => {
    const a = ev({ title: "A", start: iso(16, 9), end: iso(16, 10), placeId: ILC });
    const b = ev({ title: "B", start: iso(16, 10, 10), end: iso(16, 11), placeId: ILC });
    const c = ev({ title: "C", start: iso(16, 12), end: iso(16, 13), placeId: LGRC, skipped: true });
    const d = ev({ title: "HW", start: iso(16, 14), end: iso(16, 14), placeId: LGRC, deadline: true });
    const out = await leaveByAlerts([a, b, c, d], local(16, 7), 0, walk);
    expect(out.map((x) => x.key)).toEqual([`leave-by:${a.id}`]);
  });
});

describe("quietRoomAlerts", () => {
  const A = "pA";
  const B = "pB";
  const spots: StudySpot[] = [
    { placeId: "busy", name: "Busy Hall", level: 4, simulated: true },
    { placeId: "dubois", name: "Du Bois Library", level: 1, simulated: true },
    { placeId: "far", name: "Far Library", level: 0, simulated: false },
  ];
  const walk: WalkMinutes = async (from, to) => (from === "far" || to === "far" ? 40 : 4);
  const deps = { spotsAt: async () => spots, walk };

  it("suggests the quiet place that fits a gap of 30+ minutes, and mentions a close exam", async () => {
    const a = ev({ title: "Lecture", course: "MATH 132", start: iso(16, 11, 30), end: iso(16, 12, 45), placeId: A });
    const b = ev({ title: "Seminar", course: "FYS 191", start: iso(16, 14, 30), end: iso(16, 15, 20), placeId: B });
    const exam = ev({ title: "Midterm 2", course: "MATH 132", start: iso(17, 19), end: iso(17, 21) });
    const out = await quietRoomAlerts([a, b, exam], local(16, 8), deps);
    expect(out).toHaveLength(1);
    expect(out[0].placeId).toBe("dubois");
    expect(out[0].title).toBe("Free until 2:30pm: Du Bois Library is quiet");
    expect(out[0].body).toBe("4 min from MATH 132, 4 min to FYS 191. Good time to study for MATH 132. Crowd level is simulated.");
    expect(out[0].fireAt).toEqual(local(16, 12, 45));
    expect(out[0].staleAt).toEqual(local(16, 14, 15));
  });

  it("ignores short gaps and gaps too short for the walk there and back", async () => {
    const a = ev({ title: "A", start: iso(16, 9), end: iso(16, 10), placeId: A });
    const b = ev({ title: "B", start: iso(16, 10, 20), end: iso(16, 11), placeId: B });
    const c = ev({ title: "C", start: iso(16, 11, 30), end: iso(16, 12), placeId: A });
    const out = await quietRoomAlerts([a, b, c], local(16, 8), {
      spotsAt: async () => spots.filter((s) => s.placeId === "far"),
      walk,
    });
    expect(out).toEqual([]);
  });
});

describe("bigEventAlerts", () => {
  const base: Activity = {
    id: "act-1",
    hostId: "host",
    hostName: "Host",
    title: "Spring Concert",
    placeId: "w1",
    placeName: "Mullins Center",
    category: "social",
    status: "active",
    startedAt: iso(16, 19),
    participantCount: 3,
  };

  it("counts an activity as big by capacity or crowd, never your own", () => {
    const out = bigEventAlerts(
      [
        { ...base, capacity: 400 },
        { ...base, id: "act-2", participantCount: 20 },
        { ...base, id: "act-3" },
        { ...base, id: "act-4", capacity: 100, hostId: "me" },
      ],
      "me",
    );
    expect(out.map((c) => c.key)).toEqual(["big-event:act-1", "big-event:act-2"]);
    expect(out[1].body).toBe("Mullins Center · 20 people going");
  });
});

describe("settings", () => {
  it("each kind can be turned off, paused, or held for quiet hours", () => {
    const noon = local(16, 12);
    expect(mayAlert(DEFAULT_SETTINGS, "exam", noon)).toBe(true);
    expect(mayAlert({ ...DEFAULT_SETTINGS, exams: false }, "exam", noon)).toBe(false);
    expect(mayAlert(DEFAULT_SETTINGS, "quiet-room", noon)).toBe(false); // off by default
    expect(mayAlert({ ...DEFAULT_SETTINGS, updates: false }, "points", noon)).toBe(false);
    expect(mayAlert({ ...DEFAULT_SETTINGS, pausedUntil: local(16, 13).toISOString() }, "nearby", noon)).toBe(false);
    expect(mayAlert(DEFAULT_SETTINGS, "nearby", local(16, 23, 30))).toBe(false);
  });
});
