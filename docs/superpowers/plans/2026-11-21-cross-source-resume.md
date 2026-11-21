# Cross-source resume implementation plan

> Execute inline with regression tests, independent review, and production verification.

**Goal:** Keep the last episode and playback seconds through initial automatic selection, fatal-error fallback, retries and manual source changes.

**Architecture:** A small pure history resolver matches title/year and selects the newest valid per-source record. The play page owns a source-independent position snapshot plus a pending seek, captures it before HLS destruction, and ignores transient loading zeros. Existing per-source database records remain intact; no schema migration.

**Constraints:** Deploy only lunatv-production and keep the independent free test unchanged. Preserve account data and credentials. Do not silently play episode 1 when a destination lacks the saved episode. Match cross-source history only when title/year identify the same work; exclude remake collisions.

- [x] Add failing page regressions for initial different-source history, failure destroying currentTime, pending-seek manual handoff, manual in-flight progress, missing episodes and explicit episode reset.
- [x] Add history matching/validation tests; implement pure resolver in src/lib/playback-position.client.ts.
- [x] Integrate the snapshot through init, seek readiness, time updates, source changes, retry and HLS failure. Apply live/pending position before teardown and save valid progress only after resume is applied.
- [x] Run relevant tests, full Jest, strict lint, typecheck and build. Obtain independent review and address findings.
- [ ] Publish exact verified tree to main, await CI and production deployment; verify manual and automatic cross-source resume, refresh persistence and a real advancing video frame. Stop test playback and save proof.

Verification before publication: 143 tests in 29 suites; strict lint, typecheck and production build passed. Independent review findings (unrelated cache edits, late complete sources, explicit zero-second persistence) were addressed and re-reviewed. Resume reads server history, falling back to cache on request failure; normal browse caching remains unchanged.
