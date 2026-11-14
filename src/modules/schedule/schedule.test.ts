import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { getPlaces } from "@/modules/campus";
import type { Place, ScheduleConnectionDoc } from "@/shared/contracts";
import { toApi } from "./connections";
import { clampRange, MAX_RANGE_MS } from "./events";
import { decryptSecret, encryptSecret } from "./crypto";
import { signState, verifyState } from "./google";
import { parseFeed, splitCourse } from "./ics";
import { describeClass, manualProvider } from "./providers/manual";
import { resolvePlaceWith } from "./resolve-place";
import { fetchFeed, FeedError, hostAllowed, urlProblem } from "./safe-fetch";
import { localParts } from "./time";

// --------------------------------------------------------------------- feeds

/** Same shape as a real UMass Canvas feed: all-day deadlines with a doubled VALUE param, zero-length due times. */
const CANVAS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:icalendar-ruby
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Test Student Calendar (Canvas)
BEGIN:VEVENT
DTSTAMP:20261014T120000Z
DTSTART;VALUE=DATE;VALUE=DATE:20261019
DTEND;VALUE=DATE;VALUE=DATE:20261020
SUMMARY:Lab 2: Recursion and Debugging [CICS 210 (171644) FA26]
UID:event-assignment-1
URL;VALUE=URI:https://umamherst.instructure.com/courses/1/assignments/1
END:VEVENT
BEGIN:VEVENT
DTSTAMP:20261014T120000Z
DTSTART:20261016T213000Z
DTEND:20261016T213000Z
SUMMARY:Week 6 Attendance [FYS 191 (175100) FA26]
UID:event-assignment-2
END:VEVENT
END:VCALENDAR
`;

/** A weekly class in New York time, MWF, with one cancelled meeting, across the end of DST (1 Nov 2026). */
const RECURRING = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
DTSTAMP:20261001T000000Z
UID:class-220
DTSTART;TZID=America/New_York:20261026T101000
DTEND;TZID=America/New_York:20261026T110000
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261211T235959Z
EXDATE;TZID=America/New_York:20261028T101000
SUMMARY:COMPSCI 220 Lecture
LOCATION:Integ. Learning Center S131
END:VEVENT
END:VCALENDAR
`;

describe("parseFeed", () => {
  it("reads a Canvas feed: deadlines, courses, all-day dates at UTC midnight", () => {
    const events = parseFeed(CANVAS, { from: new Date("2026-10-15T00:00:00Z"), to: new Date("2026-10-25T00:00:00Z") }, { deadlines: true });
    expect(events).toHaveLength(2);
    const [attendance, lab] = events;
    expect(attendance).toMatchObject({ title: "Week 6 Attendance", course: "FYS 191", allDay: false, deadline: true });
    expect(attendance.start.toISOString()).toBe("2026-10-16T21:30:00.000Z");
    expect(lab).toMatchObject({ title: "Lab 2: Recursion and Debugging", course: "CICS 210", allDay: true, deadline: true });
    expect(lab.start.toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });

  it("expands a weekly class in its own time zone, skips EXDATE, survives the DST change", () => {
    const events = parseFeed(RECURRING, { from: new Date("2026-10-26T00:00:00Z"), to: new Date("2026-11-07T00:00:00Z") });
    expect(events.map((e) => e.start.toISOString())).toEqual([
      "2026-10-26T14:10:00.000Z", // Monday, EDT
      "2026-10-30T14:10:00.000Z", // Friday (Wednesday the 28th was cancelled)
      "2026-11-02T15:10:00.000Z", // Monday, EST
      "2026-11-04T15:10:00.000Z",
      "2026-11-06T15:10:00.000Z",
    ]);
    for (const e of events) {
      const local = localParts(e.start);
      expect([local.hh, local.mm]).toEqual([10, 10]);
      expect(e.end.getTime() - e.start.getTime()).toBe(50 * 60_000);
      expect(e).toMatchObject({ title: "COMPSCI 220 Lecture", locationText: "Integ. Learning Center S131", allDay: false, deadline: false });
    }
  });

  it("splits Canvas course tags off titles and leaves other titles alone", () => {
    expect(splitCourse("PA6 Comparison [CICS 210 (171644) FA26]")).toEqual({ title: "PA6 Comparison", course: "CICS 210" });
    expect(splitCourse("🏗️ Challenge 06: Binary Tree [COMPSCI 198C (173435) FA26]")).toEqual({ title: "🏗️ Challenge 06: Binary Tree", course: "COMPSCI 198C" });
    expect(splitCourse("Week 8 Attendance [FYS 191MCS26 (175100) FA26]")).toEqual({ title: "Week 8 Attendance", course: "FYS 191MCS26" });
    expect(splitCourse("Dentist [maybe]")).toEqual({ title: "Dentist [maybe]" });
  });
});

describe("event range", () => {
  it("is clamped to 62 days within a year of now", () => {
    const now = Date.parse("2026-11-14T12:00:00Z");
    const huge = clampRange({ from: new Date("1990-01-01"), to: new Date("2099-01-01") }, now);
    expect(huge.to.getTime() - huge.from.getTime()).toBeLessThanOrEqual(MAX_RANGE_MS);
    expect(huge.from.getTime()).toBeGreaterThanOrEqual(now - 366 * 86_400_000);
    const normal = { from: new Date(now), to: new Date(now + 7 * 86_400_000) };
    expect(clampRange(normal, now)).toEqual(normal);
    const reversed = clampRange({ from: new Date(now), to: new Date(now - 1000) }, now);
    expect(reversed.to.getTime()).toBe(reversed.from.getTime());
  });
});

// --------------------------------------------------------------------- URL allowlist

const ALLOWED = [".instructure.com", "calendar.google.com"];
const CANVAS_URL = "https://umamherst.instructure.com/feeds/calendars/user_abc.ics";

describe("feed URL allowlist", () => {
  it("accepts Canvas and Google links, including webcal://", () => {
    expect(urlProblem(CANVAS_URL, ALLOWED)).toBeNull();
    expect(urlProblem("webcal://umamherst.instructure.com/feeds/calendars/user_abc.ics", ALLOWED)).toBeNull();
    expect(urlProblem("https://calendar.google.com/calendar/ical/x/private-y/basic.ics", ALLOWED)).toBeNull();
    expect(hostAllowed("instructure.com", ALLOWED)).toBe(true);
  });

  it("rejects http, other hosts, look-alikes, credentials and odd ports", () => {
    expect(urlProblem("http://umamherst.instructure.com/feed.ics", ALLOWED)).toMatch(/https/);
    expect(urlProblem("https://evil.example.com/feed.ics", ALLOWED)).toMatch(/not supported/);
    expect(urlProblem("https://instructure.com.evil.example/feed.ics", ALLOWED)).toMatch(/not supported/);
    expect(urlProblem("https://notinstructure.com/feed.ics", ALLOWED)).toMatch(/not supported/);
    expect(urlProblem("https://user:pw@umamherst.instructure.com/feed.ics", ALLOWED)).toMatch(/user name/);
    expect(urlProblem("https://umamherst.instructure.com:8443/feed.ics", ALLOWED)).toMatch(/port/);
    expect(urlProblem("not a url", ALLOWED)).toMatch(/valid/);
  });

  const respond = (status: number, init: { body?: string; location?: string } = {}) =>
    new Response(init.body ?? null, { status, headers: init.location ? { location: init.location } : {} });

  it("rejects an allowlisted host that redirects elsewhere, without fetching it", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: URL | string) => {
      seen.push(String(url));
      return respond(302, { location: "https://evil.example.com/steal" });
    }) as typeof fetch;
    await expect(fetchFeed(CANVAS_URL, ALLOWED, { fetchImpl })).rejects.toThrow(FeedError);
    expect(seen).toEqual([CANVAS_URL]);
  });

  it("follows a redirect that stays on the allowlist", async () => {
    const fetchImpl = (async (url: URL | string) =>
      String(url).endsWith("user_abc.ics") ? respond(301, { location: "/feeds/calendars/moved.ics" }) : respond(200, { body: CANVAS })) as typeof fetch;
    expect(await fetchFeed(CANVAS_URL, ALLOWED, { fetchImpl })).toContain("BEGIN:VCALENDAR");
  });

  it("caps the size and times out", async () => {
    const big = (async () => respond(200, { body: "x".repeat(2000) })) as typeof fetch;
    await expect(fetchFeed(CANVAS_URL, ALLOWED, { fetchImpl: big, maxBytes: 1000 })).rejects.toThrow(/too large/);
    const slow = ((_u: unknown, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch;
    await expect(fetchFeed(CANVAS_URL, ALLOWED, { fetchImpl: slow, timeoutMs: 30 })).rejects.toThrow(/too long/);
  });
});

// --------------------------------------------------------------------- places

describe("resolvePlace on UMass location strings", () => {
  let places: Place[];
  const byName = (name: string) => places.find((p) => p.name === name)?.id;
  beforeAll(async () => {
    places = await getPlaces();
  });

  const CASES: [string, string][] = [
    ["ILC S131", "Integrative Learning Center"],
    ["Integ. Learning Center S240", "Integrative Learning Center"],
    ["Hasbrouck Lab Add 126", "Hasbrouck Laboratory"],
    ["Lederle Grad Res Ctr A301", "Lederle Graduate Research Center"],
    ["Lederle Grad Res Twr 1033", "Lederle Graduate Research Tower"],
    ["LGRT 1634", "Lederle Graduate Research Tower"],
    ["Morrill Sci Ctr (II) 222", "Morrill II"],
    ["Morrill 4 North 341", "Morrill IV North"],
    ["Goessmann Lab Add 64", "Goessmann Laboratory"],
    ["Thompson Hall 104", "Thompson Hall"],
    ["Computer Science Bldg 151", "Computer Science Building"],
    ["Elab II 119", "Engineering Laboratory II"],
    ["Engineering Lab 323", "Engineering Laboratory I"],
    ["Isenberg Schl Of Mgmt 137", "Isenberg School of Management"],
    ["Physical Sciences Bldg 114", "Physical Sciences Building"],
    ["Integ Sciences Bldg 145", "Integrated Sciences Building"],
    ["Life Sciences Lab S330", "Life Science Laboratories"],
    ["Machmer Hall W-11", "Machmer Hall"],
    ["Mahar Aud", "Mahar Auditorium"],
    ["Design Building 162", "John W. Olver Design Building"],
    ["Herter Hall 227", "Herter Hall"],
    ["Boyden Gym", "Boyden Gym"],
    ["Campus Center 163C", "Murray D. Lincoln Campus Center"],
    ["Du Bois Library 1920", "W.E.B. Du Bois Library"],
  ];

  it.each(CASES)("%s -> %s", (text, name) => {
    expect(byName(name), `no place named ${name}`).toBeDefined();
    expect(resolvePlaceWith(places, text)).toBe(byName(name));
  });

  it.each(["Zoom", "Online", "Room 101", "TBA", "", "Off campus"])("leaves %j unresolved", (text) => {
    expect(resolvePlaceWith(places, text)).toBeUndefined();
  });
});

// --------------------------------------------------------------------- secrets

describe("secrets", () => {
  const key = randomBytes(32);

  it("round-trip through AES-256-GCM and differ each time", () => {
    const a = encryptSecret(CANVAS_URL, key);
    const b = encryptSecret(CANVAS_URL, key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("instructure");
    expect(decryptSecret(a, key)).toBe(CANVAS_URL);
  });

  it("refuse a tampered value or the wrong key", () => {
    const enc = encryptSecret("refresh-token-123", key);
    const parts = enc.split(".");
    parts[3] = Buffer.from("x" + Buffer.from(parts[3], "base64url").toString("latin1")).toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
    expect(() => decryptSecret(enc, randomBytes(32))).toThrow();
  });

  it("never appear in the connections response", async () => {
    process.env.ENCRYPTION_KEY = key.toString("base64");
    const docs: ScheduleConnectionDoc[] = [
      { _id: "c1", userId: "u", provider: "ics", label: "Canvas", secretEnc: encryptSecret(CANVAS_URL, key), lastSyncAt: new Date() },
      { _id: "c2", userId: "u", provider: "google", label: "Google Calendar", secretEnc: encryptSecret("1//refresh-token-secret", key) },
      {
        _id: "c3", userId: "u", provider: "manual", label: "CICS 210",
        secretEnc: encryptSecret(JSON.stringify({ label: "CICS 210", placeId: "w292876549", room: "S131", days: ["MO", "WE", "FR"], start: "10:10", end: "11:00" }), key),
      },
    ];
    const out = await Promise.all(docs.map(toApi));
    const json = JSON.stringify(out);
    expect(json).not.toContain("instructure");
    expect(json).not.toContain("refresh-token-secret");
    expect(json).not.toContain("secretEnc");
    expect(out.map((c) => c.summary)).toEqual(["Canvas deadlines", "Your Google Calendar", "MWF 10:10am–11:00am · ILC S131"]);
  });
});

// --------------------------------------------------------------------- hand-entered classes and Google state

describe("manual classes", () => {
  it("expand to the right local days and times across DST", async () => {
    const secret = JSON.stringify({ label: "CICS 210", placeId: "w292876549", room: "S131", days: ["MO", "WE", "FR"], start: "10:10", end: "11:00" });
    const events = await manualProvider.fetchEvents(
      { id: "c3", userId: "u", provider: "manual", label: "CICS 210", secret },
      { from: new Date("2026-10-31T00:00:00Z"), to: new Date("2026-11-05T00:00:00Z") },
    );
    expect(events.map((e) => e.start.toISOString())).toEqual(["2026-11-02T15:10:00.000Z", "2026-11-04T15:10:00.000Z"]);
    expect(events[0]).toMatchObject({ placeId: "w292876549", locationText: "ILC S131", deadline: false });
  });

  it("describe themselves", () => {
    expect(describeClass({ label: "X", days: ["TU", "TH"], start: "13:00", end: "14:15" }, "LGRT")).toBe("TuTh 1:00pm–2:15pm · LGRT");
  });
});

describe("Google OAuth state", () => {
  const secret = "test-auth-secret";
  it("verifies for the same user only, before it expires, untampered", () => {
    const now = Date.now();
    const state = signState("seed-alex", now, secret);
    expect(verifyState(state, "seed-alex", now, secret)).toBe(true);
    expect(verifyState(state, "seed-blair", now, secret)).toBe(false);
    expect(verifyState(state, "seed-alex", now + 11 * 60_000, secret)).toBe(false);
    expect(verifyState(state.slice(0, -2) + "xx", "seed-alex", now, secret)).toBe(false);
    expect(verifyState(state, "seed-alex", now, "other-secret")).toBe(false);
  });
});
