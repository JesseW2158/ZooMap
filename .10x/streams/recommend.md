# Stream: recommend

**Branch:** `ws/recommend` (worktree `../ZooMap-recommend`), from `main` at `4e5c2f6`.
**Status:** code and tests written; **not yet run** (Node was not on PATH in the session). Next: `npm ci`, `npm run check`, then a real-key check.

## What exists

- `candidates.ts` (pure): candidate places with count, level, simulated flag, walking minutes from the origin, and walking minutes to the next class. Cut to the walking limit, then to places with time left to study, then to the best 12 by a shortlist score.
- `score.ts`: deterministic pick (fallback and baseline). Density dominates for quiet and social; library, study-friendly and dining adjust; walking, the next class and time available break ties. Reasons are built from the numbers and say when a count is simulated.
- `gemini.ts`: `@google/genai` call with `responseJsonSchema`, a 6 s timeout that also aborts, and `acceptAnswer`, which rejects malformed JSON or any `placeId` not offered. The prompt carries place names and numbers only; the user's note is JSON-quoted as data under its own heading.
- `service.ts`: `recommendWith(deps, userId, body)`. All other-module reads are injectable (`RecommendDeps`). Schedule failures are logged and ignored.
- `ui/Panel.tsx`: chips (Quiet / Social / Close by ≤10 min / Near my next class), time-available select, free-text note, best pick with a source badge ("Picked by Gemini" or "Fallback pick (no AI)"), two alternatives, Route via `requestRoute`.

## Decisions (owner, 2026-11-14)

- **Candidate pool widened** beyond `studyFriendly` (only 13 places): study-friendly plus `academic`, `student_life` and `dining` (about 114). Study-friendly scores higher; dining is penalised for quiet. Residences, athletic and other are never suggested.
- **No route from the origin**: walking time is a straight-line estimate (×1.3 at 80 m/min), shown as "about" / `~` to Gemini.
- "Meet people" stretch: skipped for now.
- Proximity alerts ("nearby activity / quiet spot"): not this stream; another team member built it.

## Choices made in code

- Origin in the panel: the user's position, else the building selected on the map, else the campus centre (labelled).
- The next class is the earliest future timed event in the next 12 h with a resolved place; deadlines, all-day and skipped items are ignored. Its title never reaches Gemini.
- If the walking limit or the time budget would remove every candidate, that filter is not applied.

## For integration

- `vitest.config` loads `.env.local`; with a real `GEMINI_API_KEY` there, `src/app/api/routes.test.ts` calls Gemini once (falls back after 6 s on failure). Recommend's own tests inject deps and never call Gemini.
- Confirm `GEMINI_MODEL` on the Google models page before the demo.

## Done when

- [ ] Tests (Gemini mocked): candidate building; quiet → low density, social → high; unknown place falls back; timeout falls back (written in `recommend.test.ts`, not run)
- [ ] With a real key, three preference sets give sensible, different picks
- [ ] With the key unset, the panel still answers
- [ ] `npm run check` passes
