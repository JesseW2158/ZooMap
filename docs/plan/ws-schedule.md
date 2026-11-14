# Workstream: schedule

The user's classes and events on the map, from Google Calendar and a Canvas calendar feed link.

**Owns:** `src/modules/schedule/**`, `src/app/api/schedule/**`.
**Provides:** `getUpcomingEvents`, the schedule panel.
**Consumes:** campus module, `requestRoute`, `openExternalAuth`, `GET /api/route` for walking time.

## Providers

Both implement `{ id, fetchEvents(connection, range) }` and return raw events `{ title, start, end, locationText }`.

- **Feed link (`ics`):** the user pastes the calendar feed URL from Canvas (Calendar, then "Calendar Feed"). **The server fetches a user-supplied URL, so allowlist it:** `https` only, host matching `ICS_ALLOWED_HOSTS` (default `.instructure.com,calendar.google.com`), no redirects followed off the allowlist, 5-second timeout, 2 MB cap. UMass Amherst's Canvas hostname is unconfirmed: get a real feed link from the owner and check its host against the default. The same provider accepts Google Calendar's secret iCal address, which is the fallback if UMass blocks the official connection.
- **Google (`google`):** a separate OAuth flow at `/api/schedule/google/connect` asking only for `calendar.readonly` with offline access, started through `openExternalAuth` so it works in the Android shell. Sign-in itself never asks for calendar access, so sign-in survives if this scope is blocked. Tie the callback to the signed-in user with a signed `state`. Refresh access tokens as needed; on a revoked token, mark the connection with `lastError`.

The feed URL and the refresh token are credentials. Encrypt them with `ENCRYPTION_KEY` (AES-256-GCM) into `secretEnc`; keep them out of API responses and logs.

## Matching events to buildings

Calendar locations are free text ("ILC S131", "Hasbrouck Lab Add 126"). `resolvePlace(text)` normalises the text, strips room numbers, and matches place names and aliases, longest match first. Unresolved events still appear, without a route button. When a common location fails to resolve, add it to this module's own table, `src/modules/schedule/aliases.ts` (calendar text to place id), which `resolvePlace` checks first. Campus data belongs to the routing stream.

## Events and client

`GET /api/schedule/events` merges all connections, resolves places, sorts by start, and caches per connection for five minutes.

The panel shows a connect screen with both options and where to find the Canvas link, today's events, and a "next up" card with the walking time from the current location, a **leave-by time** (start minus walk minus two minutes), and a route button.

## Done when

- Tests cover: feed parsing including a recurring event and a non-UTC time zone; the URL allowlist rejects `http`, other hosts, and an allowlisted host redirecting elsewhere; `resolvePlace` on twenty realistic UMass location strings; secrets round-trip through encryption and never appear in the connections response.
- A pasted feed link shows events in the panel with route buttons on resolved ones.
- Google connection works end to end with a test-user account. *(Needs the owner; if UMass blocks it, record that in `.10x/handoff.md` and rely on the feed link.)*
- `npm run check` passes.

## Stretch

Manual event entry; a reminder when it is time to leave.
