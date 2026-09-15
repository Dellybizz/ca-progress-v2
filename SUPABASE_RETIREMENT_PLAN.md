# CA Progress V2 — Final Supabase Retirement Plan

Status: **PLANNED — DO NOT DELETE THE SUPABASE PROJECT YET**

Repository: `Dellybizz/ca-progress-v2`  
Working branch: `phase-12-operations-admin-platform`

## Objective

Finish the Cloudflare migration by proving that CA Progress V2 can operate with **zero runtime dependency on Supabase**, then retire the remaining compatibility code, SDKs, credentials, migration-only source access, and finally the Supabase project itself.

This is the final irreversible migration phase. It must preserve the existing rollback path until all zero-Supabase verification gates pass.

## Current starting position

Production is already configured for:

- Cloudflare Worker auth (`CA_AUTH_RUNTIME=cloudflare`)
- Cloudflare D1 data runtime (`CA_DATA_RUNTIME=cloudflare`)
- retained D1 database `ca-progress-v2-phase4-shadow`
- private R2 binding `USER_RESOURCES_R2`
- Cloudflare Queue/background jobs
- Cloudflare service bindings for ICAI and Billing

The final Supabase delta/backup/reconciliation gate has already succeeded. Remaining work is retirement and proof, not another data migration.

The repository still contains Supabase-shaped compatibility/runtime code, Supabase SDK dependencies, old environment variables, migration-only workflows, stale documentation/UI text, and fallback paths. The latest runtime inventory reported 469 Supabase/RPC/query-shaped references; many already resolve to D1 through compatibility adapters, but they prevent the repository from being called fully Supabase-free.

---

# Retirement Stage 1 — Freeze, Backup and Retirement Baseline

## Goal

Create the final safety point before any compatibility or credential removal.

## Work

1. Confirm the latest production D1 state is healthy:
   - `PRAGMA foreign_key_check` returns no violations.
   - application-user count is sane.
   - representative progress/planner/community/resource/billing records are readable.
2. Preserve the latest successful final Supabase logical backup outside short-lived CI artifacts.
3. Preserve the final reconciliation report and hashes.
4. Record the current production Worker deployment/version as the rollback candidate.
5. Record current Cloudflare bindings and secret **names only**; never export secret values.
6. Verify no pending source-side Supabase writes need another delta import.
7. Freeze destructive Supabase operations until Stage 5.

## Exit criteria

- Final backup exists in durable storage.
- D1 integrity passes.
- Final reconciliation has zero unresolved discrepancy/failure/FK violation.
- Rollback deployment ID/version is recorded.
- No destructive Supabase action has been taken.

---

# Retirement Stage 2 — Remove Runtime Supabase Fallbacks

## Goal

Make all production and application code Cloudflare-native so disabling Supabase credentials cannot activate a hidden fallback.

## Work

### Authentication

- Remove Supabase OAuth/session fallback branches from `lib/auth/provider.ts` and related auth code.
- Make Worker auth the only supported runtime.
- Remove Supabase cookie/session refresh code that is no longer called.

### Data access

- Replace `createServerSupabaseClient()` / `createAdminSupabaseClient()` naming and imports with Cloudflare/D1-native repository clients.
- Remove dormant Supabase branches from routes and services.
- Convert remaining `.rpc()` compatibility paths to explicit Worker/D1 domain functions where practical.
- Remove old `isCloudflareDataRuntime()` branches once Cloudflare is the only runtime.

### Storage

- Remove legacy Supabase Storage avatar/resource fallback reads.
- Confirm new and existing resource access uses R2 only.
- Keep historical source paths only as inert metadata when required for provenance; they must not be used for network access.

### Areas that must be scanned

- auth/profile/onboarding
- academic/ICAI
- dashboard
- progress
- study/timer/timezone
- planner/tasks/goals/calendar/today-plan
- smart planner/revision engine
- notes/resources/moderation
- community/moderation/reports/reactions/read state
- billing/entitlements/subscriptions
- admin actions
- background workers

## Required assertions

A repository scan must prove there are no production callers of:

- `createServerClient` from `@supabase/ssr`
- `createBrowserClient` from `@supabase/ssr`
- `createClient` from `@supabase/supabase-js`
- `createServerSupabaseClient`
- `createAdminSupabaseClient`
- browser Supabase clients
- Supabase Auth APIs
- Supabase Storage APIs
- direct `*.supabase.co` URLs

Migration-history scripts/docs may still contain the word `Supabase`; active runtime code may not depend on it.

## Exit criteria

- No active application/Worker route requires a real Supabase client.
- No browser Supabase client exists.
- No production auth/storage/data fallback can reach Supabase.
- Typecheck, lint, build, Cloudflare dry-runs, and repository tests pass at the retirement branch head.

---

# Retirement Stage 3 — Remove SDKs, Variables, Secrets and Compatibility Surface

## Goal

Make a Supabase connection technically impossible from the deployed application.

## Work

1. Remove npm dependencies:
   - `@supabase/ssr`
   - `@supabase/supabase-js`
2. Remove `lib/supabase/` runtime files once they have zero callers.
3. Replace Supabase-generated runtime types with provider-neutral application/database types where still required.
4. Remove or rename the D1 `supabase-compat` layer after its callers are converted; the final application architecture should expose D1/repository terminology rather than Supabase terminology.
5. Remove runtime environment support for:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
6. Remove these variables from `.env.example` and deployment workflows.
7. Remove the corresponding GitHub environment/repository secrets after verification that no active workflow uses them.
8. Remove any corresponding Cloudflare Worker secret/variable names if still present.
9. Update migration-state constants so they reflect Cloudflare as the active production platform.
10. Update stale product/legal text, including:
   - Privacy page infrastructure description.
   - Resource pages that still say files are stored in Supabase Storage.
   - Migration/runtime comments that still say production is Supabase-authoritative.

## Zero-dependency static gate

The retirement gate must fail if active source contains any import from:

- `@supabase/ssr`
- `@supabase/supabase-js`

It must also fail if active deployment configuration requires any Supabase environment variable.

## Exit criteria

- Supabase SDK packages are absent from `package.json` and lockfile/dependency tree.
- `lib/supabase/` has no runtime role and is removed.
- Active deployment config contains no Supabase variables/secrets.
- Active source contains no Supabase SDK imports.
- Build works with all Supabase environment variables unset.

---

# Retirement Stage 4 — Zero-Supabase Production Proof

## Goal

Prove the live site works after Supabase credentials are unavailable.

## Deployment rule

Deploy a branch head that has **no Supabase credentials available to the Worker or build**. Do not simulate this only with feature flags.

## Required live verification

### Authentication

- guest access
- Google sign-in
- LinkedIn sign-in if retained
- callback/state/PKCE handling
- session persistence
- session rotation
- logout/revocation
- new-user bootstrap
- existing migrated-user login
- role and entitlement loading

### Data/runtime

- profile read/update
- onboarding path
- academic catalog/attempt loading
- dashboard
- progress set/clear/undo
- study timer lifecycle
- planner task/goal/calendar mutations
- Today Plan/revision interactions
- notes CRUD
- resource upload through signed R2 PUT
- R2 access/delete/cleanup
- community create/reaction/read/report/moderation
- billing entitlement/history reads and protected billing write path
- ICAI/background-job execution path

### Evidence

- Full CI passes.
- Cloudflare build/deploy passes.
- Live authenticated mutation matrix passes with zero required failures.
- D1 before/after evidence is correct.
- R2 object cleanup is verified.
- No unexpected production state is left behind by tests.
- Privacy scan passes.
- Network/runtime logs show no request to a Supabase host during the verification window.

## Hard failure rule

Any request failure caused by a missing Supabase variable, Supabase SDK, Supabase host, old Storage path, or Supabase Auth session means retirement is **not complete** and Stage 5 is blocked.

## Exit criteria

- Production has run successfully with zero Supabase credentials.
- All required live verification families pass.
- No Supabase network dependency is observed.
- Rollback remains possible using the previously recorded Cloudflare deployment plus the preserved Supabase project.

---

# Retirement Stage 5 — Observation Window and Irreversible Supabase Deletion

## Goal

Retire the external Supabase project only after the Cloudflare-only runtime has proven stable.

## Observation window

Keep the Supabase project untouched but unused for a short rollback window after Stage 4. During this window:

- monitor Worker errors and latency;
- monitor D1 integrity and mutation errors;
- monitor R2 uploads/downloads;
- monitor auth failures and OAuth callbacks;
- monitor Community, Planner, Progress, Study and Billing error rates;
- confirm no operational procedure still asks for a Supabase credential.

No new production writes should intentionally be sent to Supabase during this period.

## Final irreversible actions

These actions require **explicit user approval** after all prior gates pass:

1. Export/preserve the final retirement backup and evidence.
2. Remove remaining Supabase GitHub secrets used only by archived migration tooling.
3. Disable/archive migration workflows that connect to Supabase.
4. Remove or archive source-migration scripts that are no longer operationally required.
5. Remove obsolete Supabase project API keys/integrations.
6. Delete the Supabase project only after confirming the retained backup is usable.

Historical migration SQL and documentation may remain in the repository as provenance, provided they cannot execute as part of production/runtime CI and contain no credentials.

## Final definition of done

Supabase retirement is complete only when all of the following are true:

- Cloudflare Worker auth is the sole authentication runtime.
- D1 is the sole application database runtime.
- R2 is the sole application object-storage runtime.
- Queue/Cron/service bindings are the active background/service architecture.
- No runtime code imports a Supabase SDK.
- No runtime code creates a Supabase client.
- No active deployment requires a Supabase URL/key/service-role secret.
- No browser bundle contains Supabase client code.
- No live verification request contacts a Supabase host.
- Full CI/build/dry-run/smoke gates pass.
- Full authenticated mutation verification passes.
- D1/R2 cleanup and integrity verification passes.
- final backup/evidence is preserved outside temporary CI retention.
- stale UI/legal/runtime documentation is corrected.
- Supabase project deletion has explicit user approval.

At that point CA Progress V2 is **fully Cloudflare-native with no Supabase runtime dependency or rollback dependency**.

---

# Safety rules

- Do not merge to `main` unless explicitly requested.
- Do not delete the Supabase project merely because code cleanup passes.
- Do not remove a compatibility path until its caller count is proven zero or replaced.
- Do not remove migration evidence/backups before the observation window closes.
- Do not log or commit credential values.
- Do not use email-based account relinking to reconstruct identities.
- Preserve stable application user IDs and all historical progress/planner/community/billing relationships.
- Do not start unrelated CA Mentor work as part of this retirement phase.

# Recommended execution order

`Stage 1 backup/freeze → Stage 2 runtime fallback removal → Stage 3 SDK/config/secret removal → Stage 4 zero-Supabase deployment + full live proof → Stage 5 observation → explicit approval → Supabase project deletion`
