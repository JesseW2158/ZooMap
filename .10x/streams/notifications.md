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
- [ ] Android: fire `upcoming` with `@capacitor/local-notifications`, and show nearby alerts in the background by adding `alerts` to the presence ping reply. Needs the mobile and density streams and a new dependency.
- [ ] Big events **in advance**: activities have no future start time. Needs the activities stream to add an optional `startsAt`, or a campus events feed (team call in the brief).
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
