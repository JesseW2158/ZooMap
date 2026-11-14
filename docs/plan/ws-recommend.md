# Workstream: recommend

Gemini picks the best study spot for this user right now and explains why.

**Owns:** `src/modules/recommend/**`, `src/app/api/recommend/**`.
**Provides:** the "Find a spot" panel.
**Consumes:** `getDensitySnapshot`, `findRoute`, `getUpcomingEvents`, campus module. Start after density and routing have merged; schedule may still be a stub.

## Design

The server does the arithmetic; Gemini does the judgement.

1. **Candidates (server):** `studyFriendly` places with their current count and level, walking minutes from the user's origin, and, when the schedule has a next event with a resolved place, minutes until it starts and walking minutes from each candidate to it. Keep the twelve best by a simple score.
2. **Deterministic pick (server):** a scoring function over the same candidates and the user's preferences (quiet or social, maximum walk, time available). This is the fallback and the baseline.
3. **Gemini:** send the preferences and the candidate table with a response schema of `{ placeId, reason, alternatives: { placeId, reason }[] }`. **Accept the answer only if every `placeId` is in the candidate list**; otherwise use the fallback.
4. Use the fallback when `GEMINI_API_KEY` is unset, the call exceeds six seconds, or it errors. The response says which answered in `source`.

The key stays on the server. Send Gemini place names and numbers only: no user id, email or calendar titles. The user's free-text preference goes in as data, clearly separated from instructions.

## Client

A panel with quick preference chips (quiet, social, close by, near my next class), an optional free-text box, the pick with Gemini's reason, two alternatives, and a route button calling `requestRoute`. Label a fallback answer as such.

## Done when

- Tests cover (Gemini mocked): candidate building; the deterministic pick prefers low density for "quiet" and high for "social"; a response naming an unknown place falls back; a timeout falls back.
- With a real key, three different preference sets give sensible, different picks.
- With the key unset, the panel still answers.
- `npm run check` passes.

## Stretch

"Meet people" mode that recommends an active activity instead of a place.
