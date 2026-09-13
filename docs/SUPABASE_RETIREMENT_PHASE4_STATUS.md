# Supabase Retirement Phase 4 Status

> This records Phase 4 of the Supabase-retirement plan. It is separate from the original product implementation Phase 4.

## Status

**COMPLETE** — 6 September 2026 (Asia/Kolkata).

Phase 4 removes the dormant Supabase SDK/client/environment surface from the application runtime while deliberately preserving migration evidence, generated database types, rollback history, external credentials, and the Supabase project for later retirement phases.

## Provenance

- Phase 3 closure commit: `589740d66c679396153a1f5c5b45ba05057985ef`
- Phase 4 implementation commit: `6ddcd658a33183d66c3b8045f5197e77884e6240`
- Full Supabase Retirement Stage 2/static-build closure run: `33995299193` — passed
- Independent V2 CI run: `33995302426` — passed

## Removed in Phase 4

### SDK dependencies

Removed from `package.json`:

- `@supabase/ssr`
- `@supabase/supabase-js`

The repository intentionally has no dependency lockfile, so no lockfile rewrite was required.

### Dormant runtime clients

Deleted:

- `lib/supabase/admin.ts`
- `lib/supabase/browser.ts`
- `lib/supabase/server.ts`
- `lib/supabase/proxy.ts`

Active request authentication remains `lib/auth/*` on the Cloudflare session/OAuth implementation and application database access remains D1-backed.

### Runtime environment configuration

Removed from the active application environment contract/template:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (guarded as retired even though not present in the template)
- `SUPABASE_SERVICE_ROLE_KEY`
- `getSupabasePublicConfig()`
- `getSupabaseAdminConfig()`

`.env.example` now documents Cloudflare as the authoritative application runtime.

## Regression hardening

- `lib/env.ts` is now included in the active-runtime Supabase retirement scanner instead of being exempt.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is now a scanner blocker alongside the other retired host/secret variables.
- `.env.example` changes now trigger the retirement static-validation workflow.
- Added `tests/supabase-retirement-phase4.test.mjs` to prevent SDK packages, retired client modules, or retired runtime environment variables from returning.
- Updated early Phase 0/2 tests that previously asserted the existence of Supabase clients so they now assert the Cloudflare auth/D1 runtime boundaries.

## Verification

Run `33995299193` passed every required gate on the Phase 4 implementation commit:

- dependency install without Supabase SDK packages
- zero active Supabase runtime blockers
- read-only migration-era CI guard
- retirement regression contract
- complete repository test suite
- TypeScript typecheck
- ESLint
- Cloudflare migration Phase 2 tests
- D1 Phase 2 bootstrap validation
- Cloudflare migration Phase 3 tests
- D1 Phase 3 bootstrap validation
- Cloudflare migration Phase 4 reconciliation/shadow tests
- D1 Phase 4 resume/rollback validation
- Next.js production build
- OpenNext Cloudflare build
- web Worker dry-run
- ICAI Worker dry-run
- Billing Worker dry-run
- Phase 3 Worker dry-run/size budget
- Phase 4 Worker dry-run
- SSR smoke
- final zero-active-Supabase rescan

Independent V2 CI run `33995302426` also passed typecheck, lint, Phase 2–4 migration/D1 gates, Next.js/OpenNext builds, Worker dry-runs, SSR smoke, and the repository-wide tests.

## Deliberately retained for later phases

The following were **not** deleted in Phase 4:

- `lib/supabase/database.types.ts` — type-only schema contract still used by active code; compatibility/type architecture cleanup belongs to Phase 5.
- `lib/data/d1/supabase-compat.ts` and compatibility naming/adapter architecture — Phase 5.
- `scripts/phase4/*`, `scripts/phase5/*`, final backup/reconciliation evidence and historical Supabase migration files — Phase 6.
- `supabase/` migration history — Phase 6.
- GitHub/Cloudflare Supabase migration credentials and the external Supabase project — Phase 7 only, after retention requirements are satisfied.
- The final Phase 3 backup and retirement evidence — retained.

No destructive external Supabase operation was performed in Phase 4.

## Exit decision

**Supabase Retirement Phase 4: COMPLETE.**

Phase 5 may now begin: remove the remaining Supabase compatibility architecture/naming and migrate active type dependencies away from the retained `lib/supabase/database.types.ts` boundary, while preserving migration evidence until Phase 6.
