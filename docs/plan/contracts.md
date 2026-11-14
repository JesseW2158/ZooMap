# Contracts

The shared shapes every workstream builds against. Foundation turns this file into zod schemas in `src/shared/contracts/`; after that the code is the source of truth and this file is history.

**Changing a contract after Phase 0:** additive only (a new optional field, a new event, a new route). Make it a commit that touches only `src/shared/contracts/`, say what changed in the commit message, and get it onto `main` at once. Anything breaking goes to the owner.

## Conventions

- Ids are strings. Times are ISO 8601 strings in APIs, `Date` in MongoDB. Coordinates are `{ lat, lng }` in APIs and `[lng, lat]` in GeoJSON.
- Success returns the payload. Failure returns `{ error: { code, message } }` with a matching HTTP status.
- Every route validates input with zod and calls `requireUser(req)` unless marked public.
- Durations and times used for points come from the server clock.

## Campus data (`data/campus/`, built by `npm run campus:build`)

| File | Shape |
|---|---|
| `buildings.geojson` | Polygon features; properties `{ placeId?, name?, heightM }` |
| `ground.geojson` | Display-only features: paths, roads, grass, water; property `kind` |
| `places.json` | `Place[]` |
| `walk-graph.json` | `{ nodes: [lng, lat][], edges: [fromIndex, toIndex, meters][] }`, undirected |

```ts
type Place = {
  id: string              // stable, from the OSM id, e.g. "w123456"
  name: string
  aliases: string[]       // "ILC", "LGRT", "DuBois"
  category: 'academic' | 'library' | 'dining' | 'residence' | 'athletic' | 'student_life' | 'other'
  studyFriendly: boolean
  center: { lat: number; lng: number }
  entranceNodes: number[] // indexes into walk-graph nodes
  heightM: number
}
```

## Shared shapes

```ts
type PlaceCount = { placeId: string; count: number }

type Activity = {
  id: string; hostId: string; hostName: string
  title: string; description?: string
  placeId: string; category: 'study' | 'social' | 'sports' | 'food' | 'other'
  status: 'active' | 'ended'
  startedAt: string; endsAt?: string; endedAt?: string
  capacity?: number; participantCount: number
}

type Participation = {
  id: string; activityId: string; userId: string
  role: 'host' | 'guest'; status: 'active' | 'ended'
  joinedAt: string; leftAt?: string
  verifiedSeconds: number
  verifying: boolean      // the latest ping was in range and recent
  pendingPoints: number   // what leaving now would pay, before caps
}

type RawEvent = { title: string; start: string; end: string; locationText?: string }
type ScheduleEvent = RawEvent & { id: string; source: 'google' | 'ics'; placeId?: string }

type LedgerDraft = {
  userId: string; delta: number          // whole points, negative to spend
  ruleId: string; reason: string         // reason is shown to the user
  source: { type: string; id: string }
  idempotencyKey: string
}
type LedgerEntry = LedgerDraft & { id: string; createdAt: string }

type StoreItem = { id: string; name: string; description: string; imageUrl?: string; cost: number; stock?: number }
type Redemption = { id: string; itemId: string; cost: number; code: string; status: 'issued' | 'claimed'; createdAt: string }
```

`GET /api/activities` returns `Activity[]`; `GET /api/activities/me` returns `{ participation: Participation | null, activity: Activity | null }`; `GET /api/rewards/me` returns `{ balance, entries: LedgerEntry[], redemptions: Redemption[] }`; `GET /api/schedule/events` returns `ScheduleEvent[]`.

## Module interfaces (server side, exported from each `index.ts`)

Foundation ships every one as a stub returning fixtures. The owning stream replaces the body, never the signature.

| Module | Function |
|---|---|
| campus | `getPlaces()`, `getPlace(id)`, `searchPlaces(q)`, `nearestPlace(pos, maxM)`, `getWalkGraph()` |
| density | `getDensitySnapshot(now?)` |
| routing | `findRoute({ from: LatLng \| { placeId }, to: { placeId } })` |
| schedule | `getUpcomingEvents(userId, { from, to })` |
| activities | `listActiveActivities()`, `getActiveParticipation(userId)` |
| rewards | `getBalance(userId)` |
| auth | `getAuthUser(req)`, `requireUser(req)`; both accept a session cookie or a device bearer token |

## Plug-in registries

| Registry | File | Item |
|---|---|---|
| Map layers | `src/app/registry.ts` | React component that adds its own sources and layers, ids prefixed with the module name, inserted before a named slot layer (`slot-ground`, `slot-lines`, `slot-buildings`, `slot-markers`) |
| Panels | `src/app/registry.ts` | `{ id, title, Component }`, one tab in the bottom sheet |
| Density sources | `src/modules/density/sources/index.ts` | `{ id, getCounts(now): Promise<PlaceCount[]> }` |
| Schedule providers | `src/modules/schedule/providers/index.ts` | `{ id, fetchEvents(connection, range): Promise<RawEvent[]> }` |
| Reward rules | `src/modules/rewards/rules/index.ts` | `{ id, on: EventType, evaluate(event, ctx): Promise<LedgerDraft[]> }` |
| Event subscribers | `src/shared/events/subscribers.ts` | imports each module's `subscribers.ts` |

`src/app/registry.ts` and `subscribers.ts` are complete after Phase 0: every planned entry already points at a stub file inside its module.

## Client seams (`src/shared/`)

- `useMapStore()`: `selectedPlaceId`, `selectPlace(id)`, `routeRequest`, `requestRoute(placeId)`, `flyTo(pos)`. Panels ask for a route this way; the routing layer draws it.
- `useUserLocation()`: latest position from the active source: browser, native shell, or the dev override (click the map when `NEXT_PUBLIC_DEV_TOOLS=1`).
- `isNativeShell()` and `openExternalAuth(url)`: same-window in a browser, system browser in the shell.

## Events (`src/shared/events`)

In-process and awaited in order. A subscriber's error is logged and never reaches the emitter. Subscribers are idempotent.

| Event | Payload | Emitted by |
|---|---|---|
| `presence.updated` | `userId, position, placeId, at`; position is never stored | density |
| `activity.started` | `activityId, hostId, placeId, at` | activities |
| `activity.ended` | `activityId, hostId, at, participantCount` | activities |
| `participation.started` | `participationId, activityId, userId, role, at` | activities |
| `participation.ended` | `participationId, activityId, userId, role, joinedAt, endedAt, verifiedSeconds` | activities |
| `ledger.entry.created` | `entryId, userId, delta, ruleId, balanceAfter` | rewards |
| `redemption.created` | `redemptionId, userId, itemId, cost` | rewards |

## API

| Route | Owner | Notes |
|---|---|---|
| `GET /api/places?q=` | routing | Search by name or alias |
| `GET /api/route?to=&fromLat=&fromLng=` or `&fromPlaceId=` | routing | `{ line: GeoJSON LineString, distanceM, durationS }` |
| `GET /api/density` | density | `{ generatedAt, hasSimulated, points: { lat, lng, weight, source }[], places: { placeId, count, live, simulated, level }[] }`; `level` is 0-4 |
| `POST /api/presence/ping` | density | `{ lat, lng, accuracyM? }`; cookie or device token |
| `PUT /api/presence/sharing` | density | `{ enabled }` |
| `GET /api/activities` | activities | Active activities with participant counts |
| `POST /api/activities` | activities | 409 `ALREADY_HOSTING`, 409 `ALREADY_IN_ACTIVITY` |
| `POST /api/activities/:id/join`, `/leave`, `/end` | activities | `end` is host only |
| `GET /api/activities/me` | activities | Current participation with `verifiedSeconds` |
| `GET /api/rewards/me` | rewards | Balance and recent ledger entries |
| `GET /api/store/items` | rewards | |
| `POST /api/store/redeem` | rewards | `{ itemId }` plus an `Idempotency-Key` header; 409 `INSUFFICIENT_POINTS` |
| `GET /api/schedule/events?from=&to=` | schedule | Merged, each with `placeId` when resolved |
| `GET, POST, DELETE /api/schedule/connections` | schedule | Secrets never returned |
| `GET /api/schedule/google/connect`, `/callback` | schedule | Calendar-only OAuth |
| `POST /api/recommend` | recommend | `{ origin, prefs }` gives `{ placeId, reason, alternatives, source: 'gemini' \| 'fallback' }` |
| `POST /api/mobile/device-token` | mobile | Cookie auth only |
| `GET /api/chain/me` | chain | Stretch |

## Collections and indexes (`src/shared/db/indexes.ts`)

| Collection | Fields | Indexes |
|---|---|---|
| `users` | `email, name, image, createdAt, pointsBalance, settings.shareLocation` | unique `email` |
| `presence` | `_id` = userId, `h3` (resolution 10), `placeId`, `source`, `updatedAt`, `expiresAt` | TTL `expiresAt`; `placeId` |
| `activities` | `hostId, title, description, placeId, category, status, startedAt, endsAt, endedAt, capacity` | **unique partial `hostId` where `status: 'active'`**; `status, placeId` |
| `participations` | `activityId, userId, role, status, joinedAt, leftAt, lastVerifiedAt, verifiedSeconds` | **unique partial `userId` where `status: 'active'`**; `activityId, status` |
| `ledger` | `userId, delta, ruleId, reason, source, idempotencyKey, createdAt`; append-only | unique `idempotencyKey`; `userId, createdAt` |
| `store_items` | `name, description, imageUrl, cost, stock, active` | |
| `redemptions` | `userId, itemId, cost, code, status, idempotencyKey, createdAt` | unique `idempotencyKey` |
| `schedule_connections` | `userId, provider, label, secretEnc, lastSyncAt, lastError` | `userId` |
| `device_tokens` | `userId, tokenHash, createdAt, lastUsedAt` | unique `tokenHash` |
| `handoff_codes` | `_id` = code hash, `userId, expiresAt` | TTL `expiresAt` |

The two unique partial indexes are the rule "one hosted activity, one activity at a time". Handlers rely on the duplicate-key error and map it to 409; an application-level check alone loses races.

## Environment

| Variable | Purpose |
|---|---|
| `MONGODB_URI`, `MONGODB_DB` | Each parallel session uses its own `MONGODB_DB`; tests use `${MONGODB_DB}_test` |
| `ICS_ALLOWED_HOSTS` | Hosts a calendar feed link may point at; default `.instructure.com,calendar.google.com` |
| `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Sign-in |
| `ALLOWED_EMAIL_DOMAINS` | Default `umass.edu` |
| `DEV_AUTH` | `1` enables sign-in as a seed user; refused when `NODE_ENV=production` |
| `ENCRYPTION_KEY` | AES-256-GCM for stored calendar secrets |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Recommend |
| `SIMULATED_DENSITY` | `1` turns the simulated source on |
| `DENSITY_MIN_LIVE_COUNT` | Default 1 |
| `GEOFENCE_ENFORCED` | `0` skips the distance check for presenting |
| `POINTS_PER_MINUTE` | Default 1; raise it for the demo |
| `NEXT_PUBLIC_DEV_TOOLS` | `1` enables the click-to-set-location override |
| `NEXT_PUBLIC_APP_URL` | Deployed origin, used by the shell |
