# Workstream: notifications and alerts (proposal)

> **Status: draft for team review, 2026-11-14.** Nothing here is built yet. Items marked **Team call** need a yes or a change before implementation starts.

## The pitch

ZooMap already knows where things are happening, how busy each building is, and what your week looks like. Alerts connect those three things and tell you at the right moment:

- **"Something's happening near you."** You walk past the Student Union and a pickup game or study group is going on inside.
- **"Big event coming up."** A large planned event is announced, and you hear about it days ahead, not when it starts.
- **"Your midterm is in 3 days."** Exams, finals and project deadlines from your Canvas calendar, counted down early enough to plan for.
- **"Quiet room for your free hour."** You have 50 minutes between classes, and the 3rd floor of Du Bois is quiet and 4 minutes from your next class.

**Every type of alert can be turned on or off.** Nothing that uses your location is on unless you already share your location.

**Owns:** `src/modules/notifications/**`, `src/app/api/notifications/**`.
**Consumes:** activities, density, schedule, routing, campus, and later recommend (Gemini).

## The alerts

### 1. Nearby activity

| | |
|---|---|
| Example | "Pickup basketball at the Rec Center, 120 m from you, 6 people in. Tap to see the route." |
| Trigger | Your location update puts you within your radius (default 200 m) of an active activity's building. |
| Uses | The `presence.updated` event, which carries your position for that moment only. It is never stored, the same rule density follows. |
| Filters | Only categories you picked (study, social, sports, food); not activities you are already in; not activities that are full. |
| Anti-spam | At most once per activity, at most 3 nearby alerts an hour, none during quiet hours, none while you are in class (from your schedule). |
| Needs | Location sharing turned on. Off if location is off. |

### 2. Big planned events, in advance

| | |
|---|---|
| Example | "Friday 7pm: Spring Concert at the Mullins Center, 400 going. Your last class ends at 4:15." |
| Trigger | A new large event is announced; reminders a week before, the day before, and 1 hour before (or a "leave by" time if you said you are going). |
| Fits your schedule | Says if it clashes with a class, or how much free time you have before it. |

**Team call: where do big events come from?** Activities today start the moment they are created and have no future start time. Three options:

1. **Scheduled activities:** the activities stream adds an optional future `startsAt` to hosting, and an activity with a capacity of 50 or more, or marked "featured", counts as big. Smallest change.
2. **A campus events feed:** a calendar feed of official UMass events, read like the Canvas feed (allowlisted host, same safe fetch code the schedule module already has).
3. **Both.** Recommended if time allows: option 1 for the demo, option 2 after.

### 3. Exams, finals and projects

| | |
|---|---|
| Example | "MATH 132 Midterm 2 in 3 days, Thursday 7pm. You have 2 free hours tomorrow afternoon." |
| Source | The Canvas feed the schedule already reads. Items are tagged by their title: exam, midterm, final, quiz, project, paper, presentation. Users can fix a wrong tag. |
| When | Exams: 7 days, 3 days, 1 day, and the morning of. Projects and papers: 3 days and 1 day. Plain assignments: only the day before (or off). |
| Finals week | One summary when finals week starts: every exam, with its building and walk time. |
| Extra | The alert can suggest free blocks in the schedule to study in, which leads into alert 4. |

### 4. Quiet rooms that fit your schedule

| | |
|---|---|
| Example | "Free until 2:30. Du Bois floor 3 is quiet right now and 4 min from your next class." |
| Trigger | A gap of 30 minutes or more is starting in your schedule (or 15 minutes before it starts). |
| Picks | Study-friendly places with low current density, a short walk from where you are and from your next class, ranked by the recommend module's scoring. The recommend stream later lets Gemini choose and explain the pick; this module only decides *when* to ask. |
| Extra | When a midterm is close (alert 3), it says so: "Good time to study for MATH 132." |
| Default | **Off until the user turns it on**, because it fires often. |

### 5. Smaller alerts (keep, low effort)

- **Leave for class:** "Leave in 5 min for CICS 210 at ILC (8 min walk)." The schedule panel already computes this time.
- **Points earned:** "+42 points for 42 min at the study group."
- **Your activity:** "3 people joined your study group." / "Your activity ended."
- **Calendar broke:** "Your Canvas link stopped working, reconnect it."

**Team call:** which 2 or 3 alerts go in the demo? Suggested: nearby activity, exam countdown, quiet room. Each one shows off a different part of the app (location, schedule, density).

## Settings: everything can be turned off

One settings screen, in the bell's menu:

| Setting | Default |
|---|---|
| Nearby activities | On if location sharing is on |
| Nearby radius | 200 m (100 / 200 / 400) |
| Nearby categories | All |
| Big events | On |
| Exams and finals | On |
| Projects and papers | On |
| Plain assignments | Off |
| Quiet rooms in my free time | **Off** |
| Leave for class | On, 5 min before leaving |
| Points and activity updates | On |
| Quiet hours | 11pm to 7am |
| Hide details on the lock screen | Off |
| Pause all alerts | Off (1 h / until tomorrow / until I turn them back on) |

## How alerts reach the user

Vercel has **no background jobs**, so our server cannot wake up on its own and send a message. Each alert type uses whichever of these fits:

| Way | Used for | Works when |
|---|---|---|
| **In-app inbox** (bell, list, pop-ups); the app checks every 60 s | Everything | The app is open |
| **Scheduled on the device**: the server sends a list of upcoming alert times, and the phone or browser fires them | Exams, big events, leave for class, quiet-room gaps (all known in advance) | Browser: while ZooMap is open in any tab. Android app: even when closed, using `@capacitor/local-notifications` |
| **Riding on the location update**: the Android app already sends your location every 1 to 2 minutes in the background; the server's reply carries any new alerts, and the app shows them | Nearby activity | Android app in the background, with location on |
| **Real push** (stretch) | Breaking news, for example a big event just announced | Needs a scheduling service outside Vercel; skip for the hackathon |

The "riding on the location update" idea is what makes "something's nearby" work with the phone in a pocket, without real push. The mobile stream's location update is the only request a device token may make today, so this changes the density stream's location route (the reply gains an `alerts` field) and the mobile stream's app (shows them). Both need those streams' agreement.

iPhone is browser only (README decision), so iPhone gets the inbox and alerts while the tab is open.

## Privacy rules

- Your position is used at the moment of the location update and never stored, the same as density. Nearby alerts do not exist if location sharing is off.
- An alert never says where another person is or names a guest. "6 people in", never "Sam is here".
- Exam and course names come from your own calendar and are shown only to you. Turning on "hide details" makes the lock screen say only "ZooMap: exam reminder".
- Nothing from this module goes to Gemini. Recommend sends place names and numbers only, as its own brief says.

## Design (short)

```
src/modules/notifications/
  producers/          time-based alerts, worked out on each request, nothing stored:
                      exams.ts, big-events.ts, quiet-gap.ts, leave-by.ts
  subscribers.ts      presence.updated -> nearby; ledger / participation / activity -> updates
  classify.ts         "MATH 132 Midterm 2" -> { kind: "exam", course: "MATH 132" }
  store.ts            saved alerts, each with a key derived from its cause, so none repeats
  ui/Bell.tsx         bell, list, pop-ups, settings
  ui/Reminders.tsx    asks for permission when the user turns an alert on, sets device alerts
```

- Adding a new type of alert is one producer file plus one line, the same plug-in pattern the other modules use.
- Saved alerts expire after 14 days.
- API: `GET /api/notifications` (inbox, unread count, upcoming device alerts), `POST /api/notifications/read`, `GET`/`PUT /api/notifications/settings`.

**Outside our folder (each a small separate commit, with the owner's yes):**
- contract additions
- database indexes
- two registry lines (the bell and the reminders component)
- the `@capacitor/local-notifications` package
- the `alerts` field on the location update reply (density stream)
- optional `startsAt` for activities (activities stream)

## Build order

1. Contracts, indexes, inbox and bell.
2. Exam countdown (needs only the Canvas feed, which already works).
3. Nearby activity (in the browser first, then the Android background version with the mobile stream).
4. Quiet rooms in free time.
5. Big events, after the team picks where they come from.
6. Settings screen, then the device-scheduled versions of everything on Android.

**Cut order if behind:** real push, then big events from a campus feed, then Android device scheduling (the inbox still works), then quiet rooms.

## Done when

- Tests cover:
  - Exam tagging on 20 real-style Canvas titles.
  - Countdown times for an exam, including quiet hours.
  - A nearby alert fires once inside the radius and not again for the same activity, and never for a full activity or one you are in.
  - No nearby alert when location sharing is off.
  - A quiet-room alert only in a gap of 30 minutes or more.
  - Every setting turns its alert off.
  - One user cannot read another user's alerts.
- Demo:
  - Set the dev location next to a running activity and the alert appears.
  - The sample week shows the midterm countdown.
  - A free hour suggests a quiet room.
- On an Android phone, a nearby alert arrives with the app in the background. *(Human, on a phone.)*
- `npm run check` passes.

## Open questions for the team

1. Which 2 or 3 alerts are in the demo?
2. Big events: scheduled activities, a campus events feed, or both? Does anyone know of an official UMass events calendar feed?
3. Can the density and mobile streams add the `alerts` field to the location update and show it on Android?
4. Default nearby radius: is 200 m right for campus?
5. Should quiet-room alerts wait for Gemini (recommend stream), or start with the simple scoring and switch later?
