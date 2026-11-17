# LunaTV production deployment and recovery

Production: https://tv.hh7788.xyz — LunaTV100.1.3, based on upstream6c0428d1ae7a8322efa8031909ec77cac22fd866. The owner selected the existing shared Workers Paid plan for production and retained the independently verified Workers Free test.

## Deployment

- Worker: `lunatv-production`, independent URL https://lunatv-production.doushuqi0409.workers.dev.
- Configuration: `wrangler.production.jsonc`; CPU ceiling3000ms and external subrequest ceiling1000 affect only this Worker.
- Storage: original Upstash database; owner username remains admin. Runtime credentials are encrypted Cloudflare settings and are never committed. Build placeholders are nonsecret and absent from built server assets.
- Build: `pnpm cf:build:production`. Deploy: `pnpm cf:deploy:production`, using the original account's authorization.
- Keep the existing CNAME `tv.hh7788.xyz → cfcc90e3d33b05de.vercel-dns-017.com`, TTLauto, proxied=true. Exact route `tv.hh7788.xyz/*` invokes this Worker. The route is managed in the Cloudflare dashboard; routes are omitted from the deployment config and the installed Wrangler leaves existing routes untouched in this case.
- The owner explicitly approved hostname-only exceptions to the existing geographic restrictions. Those rules remain enabled for other hostnames. App authentication and other protections remain enabled.

## Automatic deployment from main

GitHub Actions workflow `.github/workflows/ci.yml` deploys this existing Worker after the `check` job succeeds, only for pushes to `GeekDance/LunaTV` branch `main`. Pull requests, `master`, other branches and forks cannot run the production deploy job.

The deploy job checks out the exact validated commit, installs the locked dependencies, runs `pnpm cf:build:production`, then `pnpm cf:deploy:production`. Main workflows are serialized instead of interrupting an active production deployment; superseded pending runs may be replaced by the newest pending commit. Pull-request checks can still cancel older runs.

GitHub repository secret `CLOUDFLARE_PRODUCTION_API_TOKEN` holds an account-owned token restricted to `lunatv-production` with `Individual Workers Editor`; zone/route access was removed. It is supplied only to the deploy step. Runtime Upstash credentials and the owner password stay in the Worker's encrypted settings, and are preserved during deployment. The static account ID is in the workflow/config, not a secret.

If validation or the production build fails, the deploy step does not run and the currently active Worker version remains available. Inspect the `CI` workflow's `Deploy Cloudflare production` job to see the publishing result. A failed deployment should be investigated from its logs; use the previously verified version if rollback is necessary.

The independent Free account, its Worker `lunatv-free-test`, D1 database, authentication profile and test URL are outside this deployment workflow. Do not add its credentials or configuration to the production job. Manual production deployment remains available with the commands above.

## Validation

39 regression tests, typecheck, lint and a fresh OpenNext production build passed. The original main branch's homepage regression tests are retained; resolving its conflicts preserved the exact runtime files already validated in production.

Original-hostname checks passed:100.1.3, owner logout/relogin,70 home recommendation cards,46 continue-watching cards,118-source search completion, real playback advancing60→92.9seconds, saved progress, and no client exception/console errors. Independent-address checks also verified118 existing source rows,2 account rows and favorite persistence after refresh; the test favorite was restored. Standard TLS certificate verification passed.

Fresh-deployment parallel pages with one navigation away retained working record/favorite APIs and home modules. A separate regression proves that an abandoned migration in one Worker request cannot block another request context. Request-scoped in-flight state avoids retaining promises owned by ended requests. Raw tail logs, request headers, credentials and personal viewing records are not published.

Evidence: [production checks](cloudflare-production-validation.json), [real Free checks and limits](cloudflare-real-free-validation.json).

## Data recovery boundary

The upstream constructor in the initial production build automatically upgraded the shared database's legacy keys and password storage before an encrypted application backup was exported. Existing data is readable in the upgraded application. The owner was informed before hostname cutover.

An encrypted post-upgrade application export is retained locally in Downloads, protected by the existing site owner password. It is a recovery backup for the upgraded application, not a pre-migration snapshot. Vercel/DNS-only rollback cannot restore the old schema or recover original plaintext user passwords. Preserve this backup, the original Vercel project, database and deployment; do not delete them as cleanup.

If a release fails, prefer reverting the Worker to the last verified version against this compatible database. Reverting DNS-only status stops Worker routing, but the legacy Vercel application may not understand the upgraded database. Restore application data only with a compatible upgraded version and a verified backup.

Verified deployment: `1d784cea-7980-42d7-94b8-dba6e907929b`.
