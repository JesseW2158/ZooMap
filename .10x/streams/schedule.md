# Stream: schedule

**Branch:** `aads` (on top of campus and routing). Done at the owner's request.
**Status:** built and unit-tested; not yet run against a database or in the browser (no `MONGODB_URI`); Google not tested end to end (no OAuth client).

## Finding that changed the plan

A real UMass Canvas feed (`umamherst.instructure.com`, matches the default `ICS_ALLOWED_HOSTS`) holds **only assignment deadlines**: 52 events, 49 all-day, 3 zero-length due times, **no locations, no recurrence**. Class meeting times and rooms live in SPIRE. Owner decided (2026-11-14): classes are **entered by hand** (and/or come from **Google Calendar**); Canvas deadlines show in a separate **"Due soon"** list. Canvas also writes `DTSTART;VALUE=DATE;VALUE=DATE:` (doubled parameter); node-ical copes.

## What is done

- Providers registry (`providers/index.ts`): `ics` (Canvas or Google's secret iCal link), `google` (OAuth), `manual` (hand-entered weekly class). Each stored connection's secret (feed URL, refresh token, or the class JSON) is AES-256-GCM encrypted in `secretEnc`; API responses never include it, only a safe `summary`.
- Feed fetch (`safe-fetch.ts`): https only, no credentials, port 443, host on `ICS_ALLOWED_HOSTS`, every redirect re-checked (max 3), 5 s timeout, 2 MB cap; `webcal://` accepted. Errors are user-safe and never contain the URL.
- Parsing (`ics.ts`): node-ical with `expandRecurringEvent` (RRULE, EXDATE, overrides), time zones from TZID; all-day dates normalised to midnight UTC (node-ical gives server-local midnight); Canvas course tags split off titles ("Lab 2 [CICS 210 (171644) FA26]" -> "Lab 2", course "CICS 210").
- Hand-entered classes expand in America/New_York, DST-safe (`time.ts`).
- Google: calendar-only OAuth (`calendar.readonly`, offline, `prompt=consent`), state = HMAC(AUTH_SECRET) of user id + expiry + nonce, verified against the signed-in user; refresh on each fetch; `invalid_grant`/401 records "connect again" in `lastError`. Not configured -> redirect home with `?schedule=google-unavailable`, which the panel explains.
- `resolvePlace`: module table (`aliases.ts`, regex -> place id) first, then names and aliases as whole words, longest first, after expanding SPIRE abbreviations (Integ., Ctr, Bldg, Grad Res, Lab Add…) and dropping room numbers. 24 real-format strings tested, 6 negatives.
- Events: merged across connections, five-minute cache per connection and padded window, failing connection records `lastError` and the rest still show; deadlines never get a place.
- Panel: connect screen (add class / Google / Canvas link with where-to-find steps), Next up (walking time from `/api/route`, leave-by = start − walk − 2 min, Route button), Today, Due soon, My classes and calendars (summary, error, remove).

## Contract changes (additive, own commit `dc1cd19`)

`ScheduleSource` + `manual`; optional `allDay`, `deadline`, `course` on ScheduleEvent; optional `summary` on ScheduleConnection; `CreateConnectionBody` = ics body | `ManualClass`.

## Outside owned paths

`src/app/api/routes.test.ts`: mocks `@/modules/schedule` with its fixtures (same pattern as `ws/activities`); both branches add a `vi.mock` block in the same spot, so merging needs both kept.

## Done when

- [x] Feed parsing incl. recurring event and non-UTC zone; allowlist rejects http, other hosts, redirect off-list; resolvePlace on 20+ strings; secrets round-trip and never in the connections response (unit-tested; also `connections.db.test.ts`, not run: no database)
- [ ] A pasted feed link shows events in the panel: needs a database
- [ ] Google end to end: needs the OAuth client (setup checklist step 2) and a test user
- [~] `npm run check` passes with `SKIP_DB_TESTS=1` (177 tests)

## Day planner (2026-11-14, later)

Why it exists (owner): the schedule plus navigation is the base for a day plan. The free gaps between classes are where the recommend module (Gemini) will suggest the best study spot, using noise levels, density and peers studying similar topics. Not built yet.

- **Plans** (`provider: "plan"`): one-off items on a date at a building. Recommend can add one with `createConnection(userId, { provider: "plan", label: "Study at …", placeId, date, start, end })` from the schedule module's index.
- **Skip** one occurrence of any event (`PUT /api/schedule/connections`, `skip: { eventId, skipped }`); skipped items stay listed with Undo. **Move** a plan (`plan: { start, end, … }`).
- Panel: day chips, timeline with the walk between consecutive items (Preview draws it via `requestRoute(to, { fromPlaceId })`), "Plan something here" in gaps of 30+ min, Next up with Go from here / Preview from previous stop.
- Contract change `24b5468` (additive): `plan` source, PlanBody, UpdateConnectionBody, PUT route, `connectionId` and `skipped` on events, `skipped` on the document.
- Full `npm run check` **with database tests** passed (195 tests) against a local in-memory MongoDB replica set.
