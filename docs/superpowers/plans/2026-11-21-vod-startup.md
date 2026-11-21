# VOD startup implementation plan

User approved: start explicit-source playback directly, load alternative sources in the background, bound automatic preference, remove the cosmetic delay, validate and deploy only the existing production Worker.

- [x] Add a tested client startup coordinator: explicit detail first, progressive matching alternatives, preserve the selected source, fall back on detail failure, cancel on unmount, never replace playback with late search results.
- [x] Use existing authenticated source-page search on both storage backends. Start with the first usable match rather than waiting for all sources; give automatic candidate collection and testing a combined 3 second budget once a match exists.
- [x] Bound probing to four candidates at once and propagate abort to HLS/video/HEAD resources. Preserve existing scoring, optimization switch, URL semantics, source switching and episode/history behavior.
- [x] Integrate startup in the existing play page and remove the one-second loading delay. Cover integration with unresolved background search.
- [ ] Run full regression tests, lint, typecheck and production build. Request independent review, resolve findings, then publish a reviewed main commit using the configured production-only Actions workflow.
- [ ] Confirm deployment success and current production browsing/play/source switching. Preserve independent free deployment and private settings. Record truthful observed performance and limitations.

Pre-deployment verification: 109 tests passed; typecheck, strict lint and production build passed. Independent review completed; deadline partial results, deferred history and source-card cancellation regression tests pass.
