# 00 Foundation

Runs alone. Leaves `main` in a state where no later stream needs to edit a shared file.

**Owns:** everything, until done. Afterwards `src/shared/**`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/registry.ts`, `package.json`, the lockfile and config files are frozen (see the contract-change rule in contracts.md).

**Needs from the owner:** `MONGODB_URI`, Google OAuth client id and secret. Without them, build everything and report which acceptance checks could not run.

## Steps

1. **Scaffold.** Next.js App Router with TypeScript, Tailwind and ESLint at the repo root, `src/` layout, `@/` alias. `create-next-app` refuses a directory holding `CLAUDE.md`, `.10x/` and `docs/`, so scaffold in a temporary directory and move the files in. Add `.gitattributes` (`* text=auto eol=lf`), `.env.example` listing every variable in contracts.md, and `.gitignore` entries for `.env*.local`, `.graph-indexer/`, `.remember/`.
2. **Install every dependency in the README stack table**, exact versions, including Capacitor. Later streams add none, except mobile (one location plugin) and chain.
3. **Scripts:** `dev`, `build`, `typecheck`, `lint`, `test` (vitest), `check` (typecheck, lint, test), `db:setup`, `campus:build`.
4. **Contracts:** every type, event, API shape and collection in contracts.md as zod schemas in `src/shared/contracts/`.
5. **Commit and tag `scaffold-checkpoint`.** The campus-map stream may start its build script from this tag.
6. **Database:** cached client safe for serverless, typed collection accessors, `indexes.ts`, and `scripts/db-setup.ts` that ensures indexes then calls each module's `seed(db)`. Idempotent. Seed five users from `ALLOWED_EMAIL_DOMAINS`.
   **Test database:** streams must test real unique indexes and transactions, and may not add dependencies. Write a vitest helper, `withTestDb()`, that connects to the Atlas database named `${MONGODB_DB}_test`, ensures indexes once, and empties the collections before each test file. Tests that use it run serially.
7. **Events:** the bus and `subscribers.ts` importing every module's `subscribers.ts`.
8. **HTTP helpers:** error envelope, zod body and query parsing, `requireUser`.
9. **Auth** (`src/modules/auth/`): Auth.js with JWT sessions and the Google provider asking for `openid email profile` only. In the sign-in callback, on the server, require `email_verified`, the `hd` claim and the email domain to be in `ALLOWED_EMAIL_DOMAINS`; the `hd` request parameter is only a hint. Upsert the user. Add a `dev` credentials provider behind `DEV_AUTH`. `getAuthUser` checks the session, then calls `resolveDeviceToken(req)`, which is a stub returning null for the mobile stream to fill.
10. **Module stubs:** for each of campus, density, routing, schedule, activities, rewards, recommend, mobile, chain: `index.ts` with the signatures from contracts.md returning fixtures, `subscribers.ts`, `seed.ts`, `ui/Panel.tsx` and `ui/Layer.tsx` where the module has one.
    **Fixture campus:** in `src/modules/campus/fixtures/`, hand-write about eight real UMass buildings as `Place`s with rough coordinates, their footprints as simple rectangles, and a small connected walk graph joining them. The campus stub serves these and its layer draws them, so every stream has places, a map and routes to work with before the real data lands.
11. **Route stubs:** every route in the contracts API table, in its final file, returning fixture data that passes its schema.
12. **App shell:** a phone-first page: full-screen map area, bottom sheet with one tab per registered panel, a top search slot. `MapProvider` exposes the MapLibre instance and creates the four empty slot layers. Implement `useMapStore`, `useUserLocation` (browser source plus the dev override), `isNativeShell`, `openExternalAuth` (browser behaviour). Until campus-map merges, the map shows the fixture campus on a plain background centred on 42.3868, -72.5301.
13. **Tests:** vitest configured; one test per helper with logic (domain check, error envelope, event bus error isolation).
14. **Update `CLAUDE.md`** where the real commands or layout differ from it, and `.10x/status.md` and `.10x/handoff.md` to say the foundation is merged.

## Done when

- `npm run check` and `npm run build` pass.
- `npm run db:setup` twice in a row succeeds and leaves the same data.
- With `DEV_AUTH=1`: signing in as a seed user shows the shell with every tab, and every API route returns its fixture; signed out, every route returns 401.
- A unit test of the sign-in callback refuses a token with a wrong `hd`, a wrong email domain, and an unverified email. Trying a real non-UMass account only tests your code if that account is on Google's test-user list; otherwise Google turns it away first.
- Inserting two active activities for one host directly into MongoDB fails on the second.
- `withTestDb()` works: a test that inserts a duplicate active host fails on the index.
- `git status` is clean, the `scaffold-checkpoint` tag exists, and `.10x/status.md` says the foundation is merged.
