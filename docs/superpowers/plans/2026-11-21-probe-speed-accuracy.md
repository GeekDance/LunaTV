# Correct source probe speed reporting

Root cause: a shared FRAG_LOADING timestamp can be overwritten by concurrent fragment loads, and a first-fragment payload divided by a 1ms cached read reports memory/cache speed as network bandwidth. An unrelated opaque HEAD request also cannot establish reliable network latency.

Design: use each completed media fragment's own loader stats. Correlate Resource Timing entries by request URL and start/end interval; reject ambiguity and older entries. Only display reference body throughput when positive network transfer evidence excludes local cache/revalidation/service-worker ambiguity and the sample lasts at least 200ms with at least 128KiB encoded body. Report local cache, insufficient sample and unmeasurable timing as distinct nonfatal statuses. Do not cap invented numbers or issue extra probe downloads/cache-busting requests. Show first-fragment elapsed time instead of calling a cached HEAD response network ping.

Units: MB/s and KB/s use decimal bytes; MiB/KiB remain binary in the list parser. Current source stays pinned, successful measured speeds precede unknown speeds, unmeasurable sources use first-fragment elapsed time, pending and failed sources retain their groups. Preserve 4s probe timeout, four-worker bound, cancellation, cleanup and cross-source resume.

Verification: failing cache/shared-clock regressions; tests for real request timing, cross-origin opaque timing, cache/revalidation, tiny/short samples, service workers, mismatched requests, units, nonfatal statuses and cancellation. Run full tests/typecheck/lint/build, independent review, production-only deployment, then inspect actual source labels and progressing playback. Keep the independent free test unchanged.

Primary references: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/transferSize ; installed hls.js src/types/events.ts, src/loader/load-stats.ts, src/loader/fragment-loader.ts and src/utils/xhr-loader.ts.

Final local validation: 162 tests in 31 suites passed, strict lint/typecheck and production build passed. Independent review passed after adding SW-ambiguity and nonmonotonic-timing guards. Network throughput is explicitly a reference sample, not a broadband speed test.
