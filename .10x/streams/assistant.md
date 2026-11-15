# Stream: assistant (campus chatbot)

**Branch:** `ws/recommend` (same worktree; it reuses recommend's study-spot pick). Added at the owner's request on 2026-11-14.
**Status:** code and tests written; **not yet run** (Node was not on PATH in the session).

## What it does

An "Ask" tab: "what can I do if I want to play soccer?", "best study spots?", "how busy is Du Bois?". Replies are short text plus tappable cards (activity: Join / Route; place: Route).

- `POST /api/assistant/chat` `{ messages (≤12, last from the user), origin? }` → `{ reply, cards, source }`. Stateless: the client keeps the conversation in memory (module store, survives tab switches, not reloads) and sends the last 10 messages. Nothing is stored.
- Gemini path (`service.ts`): function calling with three tools: `search_activities` (keyword + synonym match, e.g. soccer → football/futsal/pickup, else category), `recommend_study_spot` (recommend's new `pickStudySpots`, deterministic, so no nested Gemini call), `find_place` (campus search + crowd level). Up to 3 tool rounds, 12 s overall, then the fallback.
- Fallback (`fallback.ts`): keyword intent (help / study / activities / place) using the same tools. Labelled in the UI.
- Cards: the items the tools returned that the reply names; the first three when it names none.

## Privacy and safety

- Gemini sees the student's messages and tool results: activity titles, descriptions, place names, counts. No user ids, emails, host names or host ids. Calendar titles never leave recommend.
- Tool arguments from the model are clamped and type-checked (`studyPrefsFrom`); activity text is marked as data in the system prompt.

## Outside owned paths (owner approved, 2026-11-14)

- `src/shared/contracts/assistant.ts`, its export in `index.ts`, and `assistantChat` in `API_ROUTES`: additive contract commit.
- `src/app/registry.ts`: one panel line (`assistant`, "Ask").
- `src/app/_shell/AppShell.tsx` + `icons.tsx`: the "Ask" tab (sixth, after Points) and `AskIcon`; `globals.css`: `--color-mint`.
- `src/app/api/routes.test.ts`: a sample body for `assistantChat`.
- Not added to `src/shared/events/subscribers.ts` or `scripts/db-setup.ts`: the module has no subscribers and nothing to seed.

## Limits

- Activities are only those active now; the activities module has no future schedule.
- With six tabs the raised Map button is no longer centred in the bar.
