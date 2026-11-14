# Workstream: activities

Hosting and joining activities, and measuring location-verified time at them.

**Owns:** `src/modules/activities/**`, `src/app/api/activities/**`.
**Provides:** `listActiveActivities`, `getActiveParticipation`, the activity and participation events, activity markers and panel.
**Consumes:** campus module, the `presence.updated` event.

## Rules

- A user hosts at most one active activity and is in at most one activity at a time. Hosting creates the host's own participation. **Both rules are the unique partial indexes**; handlers insert and map the duplicate-key error to 409 `ALREADY_HOSTING` or `ALREADY_IN_ACTIVITY`.
- Creating an activity is two inserts (activity, host participation): use a transaction.
- An activity happens at a place. `capacity`, when set, is enforced on join.
- Ending an activity ends every participation in it. A host who leaves ends it.

## Verified time

This is what points are paid on, so the server alone computes it.

Subscribe to `presence.updated`. If the user has an active participation and the position is within 150 m of the activity's place centre (or `GEOFENCE_ENFORCED=0`):

- if `lastVerifiedAt` is set and less than 300 seconds ago, add the difference to `verifiedSeconds`;
- set `lastVerifiedAt` to now.

If the position is out of range, clear `lastVerifiedAt`. Do this as one atomic update using the server clock. A gap longer than 300 seconds earns nothing, so a phone that stops reporting stops earning.

## Settling

There is no scheduler. `settleStale(now)` runs at the start of every activities read and on each presence event: it ends activities past `endsAt`, activities whose host has had no verified ping for 30 minutes, and participations with none for 15 minutes. Each ending emits `participation.ended` with the final `verifiedSeconds`, exactly once: flip `status` with a conditional update and emit only when the update matched.

## Client

Markers in `slot-markers` for active activities with participant counts. A panel listing activities nearest first, a host form (title, place picker, category, optional end time and capacity), join and leave buttons, and for the current activity a live count of verified minutes and the points they will pay on leaving, with a clear "not at the location" state and a clear "location sharing is off, so no time is counting" state (pings are refused while sharing is off). A "route there" button calls `requestRoute`.

## Done when

- Tests cover: second concurrent host request gets 409 (fire both at once); joining while in another activity gets 409; the verified-time arithmetic including a gap over 300 s, an out-of-range ping, and `GEOFENCE_ENFORCED=0`; `participation.ended` is emitted once when leave and settle race.
- Using two dev users and the location override: host, join, move in and out of range, leave; verified minutes match.
- `npm run check` passes.

## Stretch

Activity chat or notes; recurring activities; a "people here now" count on the place sheet.
