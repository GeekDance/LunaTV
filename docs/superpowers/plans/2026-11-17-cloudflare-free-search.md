# Cloudflare Free Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Search all configured sources and pages on Workers Free without silently losing results at the per-invocation subrequest limit.

**Architecture:** Use an authenticated source manifest and one-source/one-page HTTP endpoint for D1 deployments. A browser coordinator runs four requests concurrently, accumulates each source's pages, and feeds existing result/progress UI; existing Redis deployments retain their current path.

**Tech Stack:** Next.js 15.5.29, TypeScript, Jest 27, OpenNext, Workers Free and D1.

**Spec:** `docs/cloudflare-free-search-spec.md`

## Global Constraints

- Preserve 118 sources and configured pagination; never truncate to fit the platform.
- Only independent test addresses and databases until the original goal's validation gate passes.
- No authentication weakening, new dependencies, paid services, or upstream API URLs in browser responses.
- Four concurrent browser requests; one upstream page per server invocation.

## Review Focus

- Hidden, disabled or banned-user sources: reject server-side rather than trusting manifest contents cached by the client.
- Upstream timeout/error: distinguish failure from an empty valid response and continue other sources.
- New search/unmount during requests: abort work and prevent old results from appearing.
- Multi-page and large page counts: honor configured limits with bounded scheduling, not a giant preallocated job list.
- Play-page automatic lookup and ordinary search mode: use the same complete search coordinator on D1.

### Task 1: Expose authenticated bounded source-page requests

**Files:** `src/lib/downstream.ts`, create `src/lib/search-page.types.ts`, `src/app/api/search/manifest/route.ts`, `src/app/api/search/page/route.ts`, tests under `src/lib/__tests__/`.

**Interfaces:** `SearchManifest { sources: {key:string; name:string}[]; maxPages:number }`; `SearchPageResponse { source:string; page:number; results:SearchResult[]; pageCount?:number; error?:string }`. Manifest GET returns only authorized source keys/names. Page GET accepts `q`, `source`, integer `page`, validates authorization and page bounds, then makes one downstream page request using existing parsing/cache behavior.

- [x] Write and run failing tests for unauthorized/banned users, disabled/unknown sources, invalid page bounds, and one-page fetch count.
- [x] Export a focused one-page downstream function; preserve full-search behavior for non-D1 callers. Carry meaningful error state instead of swallowing a resource or network failure.
- [x] Implement manifest/page routes, private no-store responses and server-side source/page validation. Never accept upstream URLs from the client.
- [x] Run tests and typecheck. Verify the manifest does not contain API URLs.

### Task 2: Coordinate all sources and pages in the browser

**Files:** create `src/lib/batched-search.client.ts` and `src/lib/__tests__/batched-search.client.test.ts`.

**Interface:** `runBatchedSearch(query, {signal, onStart?, onSource?}): Promise<SearchResult[]>`. `onStart(totalSources)` fires once; `onSource({source, sourceName, results, error?})` fires once per finished source, after all of its configured pages. A maximum of four page requests are active at any instant. Scheduling remains bounded even for large configured page counts.

- [x] Write a failing regression with 118 one-page source fixtures: assert all 118 distinct sources return, no request searches multiple upstream sources, and concurrency never exceeds four.
- [x] Add failing tests for three-page coverage, empty pages, a failing page without dropping other sources, and cancellation without new scheduled requests.
- [x] Implement the coordinator with injectable fetch only at the transport boundary for tests. Preserve every configured source/page and stable source identifiers.
- [x] Run all coordinator tests and the existing D1 tests.

### Task 3: Integrate complete search and retest Free deployment

**Files:** `src/app/search/page.tsx`, `src/app/play/page.tsx`, relevant tests, `CLOUDFLARE-TEST.md`, `docs/cloudflare-real-free-validation.json`.

- [x] Wire D1 search modes and play-page automatic lookup to the coordinator. Keep existing sorting, aggregation, history, result flushing and non-D1 code paths. Abort previous D1 work on a new query/unmount.
- [x] Display unavailable-source feedback without presenting failures as successful empty results. Test cancellation and ordinary search mode as well as incremental mode.
- [x] Run the complete Jest suite, typecheck, changed-file lint, and a fresh OpenNext build.
- [x] Deploy only `wrangler.free.jsonc` with profile `lunatv-free`. Repeat 118-source and multi-page public-fixture tests using fresh queries and cloud logs; assert 118 sources contribute results, not merely that all attempts completed.
- [x] Repeat login/home/playback/favorites/progress checks. Restore the normal public demo configuration after stress tests and save sanitized evidence.
- [x] Review remaining original-configuration/data and same-account domain-binding constraints before any production cutover. Do not claim the goal complete while these remain unresolved.
