# Source list availability and speed ranking

Keep the currently selected source first regardless of its probe outcome. Rank other successful probes by normalized byte rate (B/KB/MB/GB/TB, binary units), then positive measured latency. Unknown sources follow successful ones, failed probes come last. Preserve discovery order for equal/unknown/failed entries. Sorting must copy the input and must not select a source or issue additional probes.

Implementation: pure sortPlaybackSources in src/lib/source-ranking.client.ts, consumed by EpisodeSelector using its existing per-source measurements. Existing progressive display, four-probe limit, cancellation, source switching and cross-source resume stay unchanged.

Verification: failing regression first; helper and UI tests cover current failed source pinning, dynamic metric updates, mixed units, invalid/zero latency, stable ties, immutable arrays and no selection callback during ranking updates. All 151 tests across 30 suites, strict lint and typecheck pass. Publish only after final build/review, await production CI, and verify actual list order, source selection and progressing playback. Preserve the independent free test.
