# 99 Integration

Runs alone, last, on `main` after the wave-2 streams have merged. Makes the pieces work as one product and rehearses the demo.

**Owns:** everything, including frozen files.

## Steps

1. Run `npm run check` and `npm run build` on `main`. Search for fixture returns left in any module `index.ts` or API route and list what is still stubbed.
2. Walk the demo script in [README.md](README.md) end to end in a browser with two dev users, then on the deployed site with real `umass.edu` accounts, then in the Android app. Fix what breaks at the seams: an event nobody subscribed to, a panel that never calls `requestRoute`, a layer in the wrong slot.
3. Check the cross-module chain once with real data: ping, verified time, `participation.ended`, ledger entry, balance, redemption.
4. Production settings on Vercel: `DEV_AUTH` unset, `NEXT_PUBLIC_DEV_TOOLS` unset, `SIMULATED_DENSITY=1`, `POINTS_PER_MINUTE` raised so a two-minute demo earns visible points, `GEOFENCE_ENFORCED` set for the venue. Confirm `/api/*` returns 401 signed out and that dev sign-in is refused.
5. Run `npm run db:setup` against the production database.
6. Polish in this order: loading and empty states on every panel, error messages a user can act on, the first-run location explanation, phone layout at 360 px wide.
7. Write `README.md` at the repo root: what ZooMap is, how to run it, the architecture in a paragraph, the OpenStreetMap attribution, and what is simulated or mocked.
8. Update `.10x/status.md`, `.10x/handoff.md` and `CLAUDE.md` to match what was built, folding in the notes from `.10x/streams/`.

## Done when

- The demo script passes twice in a row on the deployed site and once in the Android app, with no step skipped; any step that cannot pass is reported to the owner with the reason.
- No fixture data is reachable in production.
- The root `README.md` states plainly which data is simulated and that the store is a mock.
