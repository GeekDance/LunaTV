# LunaTV production rollout

User decision (2026-11-17): use the existing Paid account for production; keep the independently verified Free account/test URL. Original database remains Upstash. Never publish credentials or raw tail logs.

- Production Worker: `lunatv-production` in original account `dae5cd014545c39ce73e20ba9ebc7cb9`.
- Independent address: https://lunatv-production.doushuqi0409.workers.dev
- Config: `wrangler.production.jsonc`, Upstash runtime secrets set through Cloudflare dashboard; owner remains admin.
- Build placeholders are nonsecret and are not found in built server assets. Runtime values come from Cloudflare encrypted settings.
- CPU ceiling 3000ms and external subrequest ceiling1000 are scoped to this Worker. Free test configuration is separate.
- Keep Vercel project/deployment and original database available for rollback. Never delete original DNS/deployment/data as cleanup.

## Gate before cutover

1. Fix observed request-lifetime error: DbManager started a migration at module initialization and retained its Promise beyond that request. Start it inside the awaited data read, clear settled Promise, retain completion state, and keep Worker in-flight state in a WeakMap keyed by its request context. Test construction/no-I/O and concurrent/subsequent reads.
2. Complete unit suite/typecheck/lint/build, then validate independent production URL: original login, 70 home cards, original source count/config, record/favorite availability and search/playback.
3. Snapshot original DNS record and compare original data UI with new UI. Bind only tv.hh7788.xyz to this Worker after gate passes; no root-zone/account migration and no other project changes.
4. Validate HTTPS and core flows at original hostname. On failure restore original record/route and retain independent test deployment for investigation.

Current code version deployed independently: ff8460ce-4f24-4308-9eb8-9e121ee96f2e. Full suite31/31, typecheck/lint/fresh build passed. Original login,70 home cards,118 source rows,2 account rows,45 historical record cards, real mainstream playback17+sec, progress resume60sec and favorite persistence passed. Test favorite was restored. Domain cutover verification is in progress.

Original configuration observed on independent production URL:118 source rows and2 user rows. After first lifecycle fix,45 continuing-watch cards are readable and sampled records/favorites requests return200 without errors. A protected encrypted application backup was downloaded to the owner’s local Downloads folder before cutover, encrypted with the existing site owner password. Raw content/credentials are not part of the repository.

Review gate: production reviewer requested canceled/overlapping cold-request coverage and database recoverability. Added request-context isolation regression: a never-completing first request does not block a second context (RED→GREEN). Backup retained. Original public CNAME before cutover: cfcc90e3d33b05de.vercel-dns-017.com. Current routing remains unchanged.

Important rollback limitation: the upstream constructor in the initial production build ran automatic schema/password migrations against the shared database before the protected backup was exported. Existing data is readable in the new version, but Vercel/DNS-only rollback cannot restore the old schema or recover original plaintext user passwords. The encrypted backup is for recovery with the upgraded application; do not claim it is a pre-migration snapshot. The user was informed before domain cutover.
