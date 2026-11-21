# Progressive VOD source list

Goal: already discovered sources are selectable while remaining providers/pages keep loading. Keep current playback and cross-source resume unchanged.

Changes:
- Render available source cards regardless of the overall search-loading flag; retain the empty state only after search finishes.
- Show a compact live count/loading indicator and a nonblocking partial-error notice.
- Sort a copied source array so rendering never mutates the progressive search state.
- Add cumulative per-page onProgress snapshots to batched search. Preserve the existing once-per-source onSource completion callback, deduplication, cancellation, and four-request limit.
- Feed only the play page from onProgress. Late results append alternatives and do not change the selected player.

Verification: red regressions reproduced the hidden source list and delayed page publication. All 147 tests across 29 suites passed after the change; strict lint, typecheck, and production build passed. Independent review found no important regression. Publish to main and await production-only CI, then verify a visible partial list, selection during ongoing search, and uninterrupted resumed playback. Leave the independent free test unchanged.
