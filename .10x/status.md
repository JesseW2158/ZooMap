# Project Status

## Project: ZooMap
**Current Phase:** Foundation done, parallel workstreams can start
**Last Updated:** 2026-11-14 by foundation
**Health:** On Track (see "Not verified")

## Progress

### Done
- [x] Requirements and scope agreed with the owner (see decisions.md)
- [x] Build plan written: docs/plan/
- [x] 00 Foundation: scaffold, contracts (tag `scaffold-checkpoint`), db and indexes, event bus, HTTP helpers, auth with the server-side domain check, stub modules, every API route returning fixtures, map shell with slot layers, tests

### In Progress
(none)

### Pending
- [ ] Owner: setup checklist in docs/plan/README.md (Atlas, Google OAuth, Gemini key, Vercel, Android Studio)
- [ ] 01 Campus map
- [ ] Density
- [ ] Activities
- [ ] Routing and search
- [ ] Mobile shell
- [ ] Rewards and store
- [ ] Schedule
- [ ] Recommend
- [ ] Chain (stretch)
- [ ] 99 Integration

### Blocked
(none)

## Not verified by Foundation
- Atlas: the database checks ran against an in-memory MongoDB replica set (mongodb-memory-server, installed outside the repo), not Atlas.
- Google sign-in end to end, including whether UMass lets this app sign in student accounts (README risk 1). Only the policy unit tests and DEV_AUTH were exercised.
- The map in a browser: the Chrome extension was not connected, so MapLibre rendering, the bottom sheet and the dev location picker were checked by typecheck, build and server-rendered HTML only.

## Risks
See "Risks" in docs/plan/README.md. The first to test: whether UMass allows outside apps to sign in with student Google accounts.
