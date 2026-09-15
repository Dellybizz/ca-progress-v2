# Supabase Retirement Phase 6 Status

> This records Phase 6 of the Supabase-retirement plan. It is separate from the original CA Progress product implementation phases.

## Status

**COMPLETE** — 6 September 2026 (Asia/Kolkata).

Phase 6 retires the repository's executable Supabase migration/cutover machinery and historical active Supabase migration tree after the application runtime and compatibility architecture were already retired in Phases 4 and 5. The permanent Cloudflare runtime, D1 migration chain, and final retirement evidence remain intact.

## Provenance

- Phase 5 completion record commit: `936ccb3feba48e3fbb9cdb8b5e5b07dffe0da6d0`
- Phase 6 migration-artifact retirement commit: `ae5b57c938d48bd6bbfacbc28dce9d07dee0580d`
- Permanent retirement verifier lint correction: `77c5d873f069b8a1886eca0a7142e3e03140f215`
- Retained D1 validator decoupling commit: `8b24604b76663ddcb54cda148ff785bb989e1e58`
- Historical test-retirement commit: `9a1369bb8fccdec24782a035b2a440030083ed32`
- Final stale representative-test correction: `4a3b1d612a6d6a2e1996a67e68899779ee7564a6`
- Rootless OpenNext build correction used at Phase 6 closure: `80fcafbf474ce173fb03d68487881627d6fe795a`
- Final Phase 6 regression-guard / validated implementation SHA: `e28d8b48d3c05f71d3e98376bc63d7b92fe49445`

Final green workflows on the Phase 6 validated implementation SHA:

- Supabase Retirement Permanent Closure: run `33999515933`, job `101395754846` — **PASS**
- Independent V2 CI: run `33999515981`, job `101395755079` — **PASS**

## Retired in Phase 6

### Supabase migration history and executable migration tooling

Removed from the active repository surface:

- `supabase/`
- `scripts/phase4/`
- `scripts/phase5/`
- `scripts/validate-d1-phase2.mjs`
- `scripts/validate-d1-phase3.mjs`
- `scripts/validate-d1-phase4.mjs`
- migration-era data contracts/adapters that no longer had active callers
- the obsolete migration-era root `wrangler.jsonc`
- `wrangler.d1.phase2.jsonc`
- `wrangler.phase3.jsonc`
- `wrangler.phase4.jsonc`

At Phase 6 closure, OpenNext temporarily used `--skipWranglerConfigCheck` and the production web config lived at `wrangler.web.jsonc`. That was a post-retirement deployment-shape choice, not a Supabase dependency.

### Migration-era GitHub Actions workflows

Removed obsolete cutover/verification workflows whose purpose ended with retirement, including the Phase 1 authenticated mutation runner, Phase 2 fixture discovery, Phase 3 exact-commit/mutation workflows, Phase 4 shadow/verification workflows, Phase 5 cutover/final-delta/inventory workflows, and the temporary Stage 1/Stage 2 Supabase-retirement workflows.

They are replaced by the permanent post-retirement closure workflow:

- `.github/workflows/supabase-retirement-closure.yml`

V2 CI also enforces the permanent retirement contract.

### Historical test contracts

Tests whose only source of truth was deleted Supabase/Postgres SQL, RLS policy text, RPC definitions, or retired Wrangler files were removed. Mixed suites were rewritten to validate the current application behavior directly through D1/R2/Cloudflare code.

The resulting Phase 6 repository suite contained **182 tests: 182 passed, 0 failed** on the validated implementation SHA.

## Permanent retirement guard

The repository uses:

- `scripts/verify-supabase-retired.mjs`
- `tests/supabase-retirement.test.mjs`
- `.github/workflows/supabase-retirement-closure.yml`

The verifier permanently rejects:

- retired Supabase migration/tooling paths
- Supabase SDK packages
- Supabase runtime environment variables/secrets
- active `lib/supabase/*` runtime modules
- Supabase compatibility modules/factories
- retired migration package scripts

It also requires the retained post-retirement evidence and production Cloudflare/D1 configuration to remain present.

Final Phase 6 verifier result on `e28d8b48d3c05f71d3e98376bc63d7b92fe49445`:

- status: **pass**
- scanned active files: **310**
- failures: **0**

## D1 validation after migration-tool retirement

The retained hot-query migration validator no longer depends on deleted Phase 4 Wrangler configuration. It creates an ephemeral local-only D1 validation config, applies the retained `d1/migrations` chain idempotently, checks intended query plans/indexes and `PRAGMA foreign_key_check`, then removes the temporary config.

Final result: **PASS**.

No D1-native data was deleted or rewritten as part of Phase 6.

## Final Phase 6 verification

Permanent Closure run `33999515933` passed every required Phase 6 gate:

- dependency install
- permanent retirement enforcement
- retirement regression contract
- TypeScript typecheck
- ESLint
- retained D1 migration/index/FK validation
- repository-wide tests: 182/182 passed
- Next.js production build
- OpenNext Cloudflare build
- production web Worker dry-run/size validation
- ICAI Worker dry-run/size validation
- Billing Worker dry-run/size validation
- Cloudflare SSR smoke
- final permanent retirement rescan

Independent V2 CI run `33999515981` independently passed the same post-retirement runtime/build contract.

## Post-retirement Cloudflare deployment correction

After Phase 7 was closed, a Cloudflare native build surfaced a deployment-path mismatch: native Cloudflare deployment expected the standard root Wrangler configuration while repository CI was using the nonstandard `wrangler.web.jsonc` alias and an OpenNext root-config skip.

This was corrected without restoring any Supabase-era configuration:

- commit `514aac904a1e43876cc0718b546650df0fbbe7b3` introduced a new **Cloudflare-only** canonical root `wrangler.jsonc`, moved the current D1/R2/service/queue/Durable Object production bindings into it, removed `wrangler.web.jsonc`, and removed `--skipWranglerConfigCheck`
- commit `b440874a8e85122a3b0bf5e14bee5b0169d22179` aligned the remaining Community/R2/ICAI regression assertions with the canonical root config
- commit `4568e47f23b84bbb68fc6e97657e5a2c350b9ae8` explicitly documented the canonical config in the deploy workflow and triggered a real end-to-end deployment

Exact-head verification on `4568e47f23b84bbb68fc6e97657e5a2c350b9ae8`:

- V2 CI run `34001458622`, job `101400955541` — **PASS**
- Supabase Retirement Permanent Closure run `34001458610`, job `101400955590` — **PASS**
- Cloudflare V2 Deploy run `34001458660`, job `101400955677` — **PASS**

The real deployment passed:

- permanent retirement enforcement
- typecheck/lint
- retained D1 validation
- complete repository tests
- Next.js/OpenNext builds and Worker dry-runs
- generated SSR smoke
- remote pre-deploy D1 evidence
- ICAI Worker deployment
- Billing Worker deployment
- existing web Worker secret validation
- web Worker deployment using `wrangler.jsonc`
- production health/SSR and remote D1 post-deploy verification
- deployment evidence upload

No rollback was triggered.

The current root `wrangler.jsonc` is guarded by the retirement verifier and contains no Supabase SDK, URL, key, project reference, or runtime dependency. The historical migration-era root Wrangler file remains retired; only the filename was reused for the new canonical Cloudflare-only production config.

## Deliberately retained evidence and production state

The current post-retirement repository preserves:

- `docs/SUPABASE_RETIREMENT_PHASE3_STATUS.md`
- `docs/SUPABASE_RETIREMENT_PHASE4_STATUS.md`
- `SUPABASE_RETIREMENT_PHASE5.md`
- final Phase 3 logical-backup/reconciliation facts and hashes recorded in the retirement evidence
- `lib/data/database.types.ts`
- `d1/migrations/`
- canonical Cloudflare-only `wrangler.jsonc`
- `workers/icai-sync/wrangler.jsonc`
- `workers/billing/wrangler.jsonc`
- the authoritative Cloudflare D1 database and all legitimate D1-native rows

The final Phase 3 backup remains the retirement backup of record and was **not repeated**.

## External boundary

Phase 6 itself performed no irreversible external Supabase action. Those actions were deferred to Phase 7, which has since been completed and is recorded in `docs/SUPABASE_RETIREMENT_PHASE7_STATUS.md`.

No merge to `main` was performed.

## Exit decision

**Supabase Retirement Phase 6 remains COMPLETE.**

The post-retirement deployment correction changes only how the current Cloudflare-only configuration is discovered. It does not reopen or weaken any Supabase-retirement criterion.
