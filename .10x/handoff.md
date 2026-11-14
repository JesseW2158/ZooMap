# Current Handoff

> This file tracks the context passed from one role to the next. Each role overwrites the "Current Handoff" section when passing work forward. Previous handoffs are preserved in the History section below.

## From: Foundation session → To: workstream sessions
**Date:** 2026-11-14
**Phase:** Foundation → parallel workstreams

### Context
Foundation is on `main`. `npm run check` and `npm run build` pass. Read CLAUDE.md ("Conventions set by the foundation"), then your brief.

- **Every API route exists** with a fixture body that passes its schema and a 401 when signed out (`src/app/api/routes.test.ts` walks `API_ROUTES`). Replace the stub body, keep the contract. Stub bodies are marked `// FOUNDATION STUB`.
- **Your UI file already exists and is already in `src/app/registry.ts`:** `ui/Panel.tsx` or `ui/Layer.tsx` per module, `routing/ui/Search.tsx`, `mobile/ui/Bridge.tsx`. Replace the body and keep the export name. You should not need to edit any frozen file; if you do, stop and tell the owner.
- **Inside a module use relative imports.** ESLint fails deep imports of other modules and server imports in client code.
- **Sign in locally** with `DEV_AUTH=1`: five seed users `dev.<alex|blair|casey|drew|eli>@umass.edu` (ids `seed-<name>`) appear on `/signin`. `AUTH_SECRET` must be set. `NEXT_PUBLIC_DEV_TOOLS=1` adds "Set my location".
- **Database:** use your own `MONGODB_DB`, run `npm run db:setup` (a new database has no indexes until then). DB tests use `withTestDb()`.
- **Fixture campus:** ids `fx-dubois`, `fx-ilc`, `fx-lgrt`, `fx-hasbrouck`, `fx-campus-center`, `fx-berkshire`, `fx-mullins`, `fx-kennedy`. Positions are approximate. Do not depend on exact coordinates.
- **Map:** no glyphs, so no text labels. Use `addLayerToSlot(map, spec, "slot-lines")` and prefix layer ids with your module name.
- **Auth.js** returns 500 from `auth()` when `AUTH_SECRET` is missing.
- **Integration should grep `FOUNDATION STUB`** to find anything left unreplaced.

### Open Questions
- Does UMass allow outside apps to sign in with student Google accounts? Not tested (no Google OAuth client was available to Foundation).
- Atlas was not available either; database checks used an in-memory replica set. Run `npm run db:setup` and `npm run check` once against Atlas.

---

## Handoff History
### 2026-11-14: planner → Foundation session
The plan is in docs/plan/. Start with docs/plan/00-foundation.md. Open questions: Atlas and Google OAuth setup, UMass sign-in policy.

### 2026-11-14: init-project → First active role (Setup → Brainstorming)
Project state initialized. Open questions (what, why, for whom) were answered in planning; see decisions.md.
