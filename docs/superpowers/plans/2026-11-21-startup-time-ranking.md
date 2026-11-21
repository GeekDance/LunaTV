# Rank source alternatives by first-frame startup time

User request: use actual startup latency rather than unavailable bandwidth. Pin the current source and place failures last; test then deploy only production.

Measurement: start a monotonic timer when each media probe begins (not when queued). Wait until the video has current decoded data (readyState >= 2, via loadeddata/canplay/playing). Freeze that first readiness time even if reference-network bookkeeping finishes afterward. Metadata alone is not success. Preserve the existing 4-second timeout, cancellation, four-worker limit and cleanup.

Display/sort: show 起播 Nms as the primary metric. Sort current source, valid startup times ascending, pending/legacy timings in discovery order, then failures. Ignore throughput, fragment-only timing and ping for list ranking. Equal startup times remain stable; ranking updates never select playback.

Episode ownership: probe the currently selected episode. Cancel and discard old results on episode changes; only reuse precomputed results from the matching episode. Initial and automatic-fallback probes tag their episode indices. Preserve progressive results and cross-source resume.

Validation: regressions failed on metadata-only early completion and old ranking. All 164 tests across 31 suites, typecheck, strict lint and production build pass. Independent review passed. Await production-only CI, then inspect real first-frame labels, sorting, manual/automatic switching, continued playback, and cleanup. Keep the independent free test unchanged.
