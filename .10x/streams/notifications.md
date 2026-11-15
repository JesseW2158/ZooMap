# Stream: notifications and alerts

Branch `aads`. Brief: `docs/plan/ws-notifications.md`.

## Status (2026-11-14)

- [x] Contracts: `AlertKind`, `Alert`, `UpcomingAlert`, `AlertSettings`, `NotificationsResponse`, `MarkReadBody`, `AlertSettingsBody`, `NotificationDoc`, `NotificationSettingsDoc`, three `API_ROUTES` entries.
- [x] Collections `notifications` and `notification_settings`; indexes `userId_at`, `userId_kind_at`, TTL `expires_ttl` (14 days).
- [x] Alerts:
  - nearby activity (on `presence.updated`, radius and categories, once per activity, 3 an hour)
  - big event (an active activity with 50+ spots or 15+ people)
  - exam, quiz, project and assignment countdowns from calendar titles (`classify.ts`)
  - quiet room for a free gap of 30+ minutes
  - leave for class
  - points earned
  - someone joined your activity (says how many, never who)
- [x] Settings: every kind toggles; nearby radius and categories; leave-by lead time; quiet hours 23:00–07:00; hide details; pause.
- [x] UI: `AlertsCenter` (headless registry entry). Bell top-right with an unread badge, inbox with route buttons, "Coming up today", settings, pop-ups, browser notifications after the user allows them.
- [x] Tests: `notifications.test.ts` (pure) and `notifications.db.test.ts`. `npm run check` green.
- [ ] Android, alerts while the app is closed: **skipped by the owner for now.** The plan was to fire `upcoming` with `@capacitor/local-notifications` and add `alerts` to the presence ping reply; it needs the mobile and density streams, a new dependency and a phone.
- [x] Big events **in advance**: a separate **planned events** module (`src/modules/planned`, Events tab, `/api/planned-events`). Activities are unchanged: they still start when hosted and count verified time.
  - Anyone can announce an event up to 90 days ahead (at most 24 h long, at most 5 coming up per host).
  - Others tap "I'm going"; capacity is enforced in the update filter. Only counts are shown, never who is going.
  - Big means 50+ spots or 15+ going. Everyone with big-event alerts on gets "New big event" when it is posted, then reminders a week, a day and an hour before. Each alert says whether it clashes with a class or when your last class ends.
  - People going get the same reminders (kind `going`, under the "updates" setting) whatever the size.
- [x] Cancelling: the host cancels; `planned.cancelled` (new domain event) tells everyone who was going, saved even during quiet hours or a pause so it waits in the inbox.
- [x] Map: `PlannedEventsLayer` puts a labelled HTML pin ("🎉 Fri 7pm") on each event in the next week; tapping it opens the Events card in a pop-up. Gold = big, maroon = you are going.
- [ ] A campus events feed as a second source of planned events.
- [ ] Real push (Web Push / FCM): stretch, needs a scheduler outside Vercel.

## How it works

- **Time-based alerts are not stored until due.** `GET /api/notifications` runs the producers and saves each due alert under `_id = "<userId>:<cause>"`, so polling is what sends them and each one is saved once. Alerts due in the next 24 hours come back as `upcoming`, and the browser fires them on time with timers.
- **Event-caused alerts** (nearby, points, joined) are saved by `subscribers.ts`, with the same keyed `_id`.
- Walking times come from `findRoute` and are cached per place pair. Quiet rooms use `getDensitySnapshot(at)`; when that snapshot includes simulated counts, the alert says "Crowd level is simulated."
- Positions are used only inside the `presence.updated` handler and are never stored.

## Notes for other streams

- **activities**: an optional `startsAt` on hosting would let big events be announced days ahead. `bigEventAlerts` is where to read it.
- **density / mobile**: the plan is for `POST /api/presence/ping` to return `alerts` (unread nearby alerts) and for the shell to show them as local notifications. Nothing is changed in your files yet.
- **recommend**: the quiet-room producer has its own simple scoring (`level × 6 + walk there + walk on`). Swap in `recommendStudySpot` once it is real.
- A local `.env.local` with `POINTS_PER_MINUTE=10` fails one activities test that assumes 1. Run the checks with the default.

- In `npm run dev`, the event bus lives on `globalThis` and keeps the event list it was created with. After adding a domain event, restart the dev server, or `emit` fails with "Cannot read properties of undefined (reading 'parse')".
