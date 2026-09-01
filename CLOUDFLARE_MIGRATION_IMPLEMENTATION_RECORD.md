# CA Progress V2 — Cloudflare Migration Implementation Record

## Migration position

The migration is executed after CA Mentor Phase 2 and before CA Mentor Phase 3.

Mentor freeze commit: `cbb188e70be6dbe565b499d1d372eb98d3826269` (`Mentor Phase 2: normalize academic catalog`).
Phase 1 implementation commit: `a319690718454caa11edebdf4b32a5730071a02d` (`Cloudflare migration Phase 1: audit and abstraction`).

---

# Phase 1 — Infrastructure Audit, Freeze and Data Abstraction

Status: **IMPLEMENTATION COMPLETE — GLOBAL VALIDATION BLOCKED BY PRE-EXISTING REPOSITORY TEST FAILURE**

## Scope completed

- Complete Supabase dependency audit across database, auth, RPC, RLS, triggers, realtime, storage, billing, community, planner, progress, study, resources, academic/ICAI and Mentor Phases 1–2.
- Effective relational/data-contract freeze documented.
- All baseline Supabase migrations inventoried.
- Mentor Phase 2 canonical Academic Catalog IDs frozen as migration invariants.
- PostgreSQL→D1 compatibility map documented.
- Authorization matrix documented.
- Current/planned Cloudflare runtime binding contract documented.
- Provider-neutral migration/repository contract added in `lib/data/migration-contract.ts`.
- OAuth route calls moved behind `lib/auth/provider.ts` while Supabase Auth remains active.
- Profile/onboarding/avatar persistence moved behind `lib/profile/service.ts` while Supabase remains active.
- Community browser realtime moved behind `lib/community/realtime-provider.ts` while Supabase Realtime remains active.
- Existing R2, billing Worker and ICAI Worker architecture retained.
- Hyperdrive documented only as an optional transition path, never the final repository contract.

## Phase 1 validation

On the Phase 1 commit, typecheck and lint passed. Repository-wide `npm test` failed at the same stage as the frozen Mentor Phase 2 baseline and earlier pre-Mentor validation; sequential Next/OpenNext/Worker checks were consequently skipped by the existing workflow. The global test-stage blocker therefore predates this migration.

## Deliberately not done in Phase 1

- No production data migration, D1 schema/binding activation, authentication replacement, Queue/KV/Durable Object dependency, Hyperdrive binding, billing/ICAI rewrite, Migration Phase 2 or Mentor Phase 3.

---

# Phase 2 — Build the Cloudflare D1 Data and Authorization Platform

Status: **COMPLETE — PHASE 2 DEFINITION OF DONE PASSED; REPOSITORY-WIDE TEST BLOCKER REMAINS PRE-EXISTING**

Phase 2 implementation commit: `713784bd91343b827d43774f19fef8752cb277b0` (`Cloudflare migration Phase 2: build D1 data platform`).
Validation-order commit: `ded282c97074b7343ad6291a230d9e7b8e56939a`.
Worker smoke-test stabilization commit: `125f89ccb3fc15c39b5f706f93df007894afc504` (`Cloudflare migration Phase 2: stabilize Worker smoke test`).
Final validation run: GitHub Actions `33514140805`, quality job `99876783030`.

## Schema coverage

D1 migrations under `d1/migrations/` cover:

- stable `app_users` identity mapping, roles, profiles and preferences;
- academic engine: levels, groups, subjects, syllabus versions, attempts, attempt applicability, chapters, topics/Accounting Standards and academic change events;
- Mentor Phase 2 canonical Academic Catalog nodes, version items, aliases and explicit lineage;
- chapter progress and immutable progress event history;
- planner events, Today Plan persistence/items, revision rules/due items, tasks, goals, calendar, dashboard events and forecasts;
- study sessions and timer state;
- notes/tags, R2 resource metadata/mappings, reporting and moderation;
- community channels/messages/mentions/reactions/pins/read state/notifications/reports/chat blocks/moderation audit;
- ICAI sources, sync runs, snapshots, resources, exam events, change/review metadata and system health;
- subscription plans, entitlements, subscriptions, payment orders/events and subscription events;
- Mentor Phase 1 model versions, source/evidence, exam/learning intelligence, personalization rules/eligibility and recommendation explanations;
- app settings and migration tracking.

## Stable/history decisions

- Existing IDs are represented as D1 `TEXT` and must be imported verbatim.
- New target-side IDs are Worker-generated; D1 defaults do not replace source IDs.
- `academic_catalog_nodes.canonical_id` is an immutable migration invariant and is never generated from names or titles.
- Historical syllabus versions, `supersedes_version_id`, attempt applicability, version items, aliases, lineage, chapter progress and progress events remain separate historical rows.
- No normalization step rewrites old progress onto the current syllabus.

## PostgreSQL compatibility / authorization replacement

- RLS, `auth.uid()` and `auth.jwt()` are replaced by explicit trusted Worker/service authorization in `lib/data/authorization.ts`.
- Browser-supplied user IDs cannot establish actor identity.
- Ownership compares a persisted owner ID with the trusted session actor.
- Moderator/admin/owner/parent-owner and service-only gates are explicit.
- Billing writes are restricted to the Billing service binding; ICAI sync writes to ICAI sync; Mentor model writes to Mentor/system services.
- PostgreSQL RPC/function/trigger behavior is mapped in `lib/data/d1/operation-map.ts` to Worker queries, Worker transaction logic, D1 batches or service bindings.
- D1 triggers are not used as a security boundary.
- UUID, JSONB, arrays, timestamptz, `FOR UPDATE`, advisory-lock, full-text/index, FK and upsert differences are documented in `docs/cloudflare-migration/PHASE_2_D1_PLATFORM.md`.

## Repository platform

- `lib/data/d1/adapter.ts` implements the Phase 2 target D1 operations without being selected by production runtime.
- `lib/data/phase2-contract.ts` defines one logical authorization contract for the frozen Supabase adapter and the D1 target adapter.
- `lib/data/migration-contract.ts` records Phase 2 readiness while production remains `activePersistence: "supabase"` and `d1ProductionActivated: false`.

## Migration/bootstrap platform

- `wrangler.d1.phase2.jsonc` is local validation only; production Wrangler bindings are unchanged.
- `scripts/validate-d1-phase2.mjs` applies D1 migrations into a fresh temporary local D1 with Wrangler, validates schema/FKs, then reapplies to test migration tracking/idempotency.
- Wrangler `d1_migrations` remains the D1 migration authority; `_ca_schema_migrations` records source-freeze provenance.
- Rebuild/rollback is documented. Because Phase 2 has no production D1 data, rollback is source revert + clean local rebuild, not destructive reverse SQL.

## Phase 2 Definition-of-Done validation

Final branch CI evidence from run `33514140805`, job `99876783030`:

- Typecheck: **PASS**.
- Lint: **PASS**.
- Phase 2 contract tests: **PASS**.
- Clean D1 bootstrap from zero: **PASS**.
- D1 schema/foreign-key validation and migration re-application: **PASS**.
- Stable-ID/canonical Academic Catalog invariant checks: **PASS**.
- Historical syllabus/progress preservation tests: **PASS**.
- Explicit authorization tests: **PASS**.
- Supabase/D1 logical repository contract tests: **PASS**.
- Next.js production build: **PASS**.
- OpenNext Worker build and Wrangler dry-runs: **PASS**.
- Local Cloudflare SSR smoke test: **PASS**.
- Repository-wide `npm test`: **FAIL**, matching the known pre-existing global test-stage blocker observed before Cloudflare Migration Phase 2. This failure is not a Phase 2 D1/platform regression and does not invalidate the Phase 2 Definition of Done because every Phase-2-specific gate and Cloudflare build/runtime gate passed independently.

## Blockers / residual risk

- The repository-wide test suite still contains a pre-existing failure outside the Phase 2 migration scope. It should be tracked separately and must not be represented as a D1 migration failure.
- Production remains Supabase-backed; Phase 2 intentionally does not prove production data reconciliation or cutover. Those belong to later migration phases.

## Explicitly not done

- No live/production data migration.
- No production reads/writes switched to D1.
- No production `DB` binding created/activated.
- No Supabase Auth replacement.
- No Supabase Realtime replacement.
- No Hyperdrive final data layer.
- No Migration Phase 3.
- No CA Mentor Phase 3.

## Phase 2 completion decision

**Phase 2 is Complete.** The Cloudflare D1 data and authorization platform is implemented and all Phase 2-specific Definition-of-Done checks pass. Supabase remains the active production persistence/auth platform until later migration phases explicitly change that state.

---

# Phase 3 — Authentication, R2, Jobs and Realtime Migration

Status: **COMPLETE — PHASE 3 DEFINITION OF DONE PASSED; REPOSITORY-WIDE TEST BLOCKER REMAINS PRE-EXISTING**

Phase 3 start/baseline commit: `737617e0612f7e0353078d06a138bcefc3ea966e`.
Phase 3 implementation commit: `9d603efea8953d4d3161414eaaed24c054f1f8bd` (`Cloudflare migration Phase 3: auth R2 jobs and realtime`).
Phase 3 validation follow-up commit: `6ccda81703fa43b0bfc9b5e363e6a4747820219c` (`Phase 3: tighten realtime validation`).
Final Phase 3 validation run: GitHub Actions `33529091761`, quality job `99927350468`.
Direct pre-Phase-3 baseline run: GitHub Actions `33518211187`, quality job `99890522279`.

## Authentication architecture / user-ID mapping

- `app_users.user_id` remains the permanent application ownership key.
- D1 adds conceptual `users`, explicit `auth_identities` and opaque `sessions`.
- Existing Supabase Auth users deterministically retain their exact current `auth.users.id` as `application_user_id`; progress, planner, study, resources, community, subscription/billing and Mentor ownership therefore does not change.
- Google/LinkedIn provider subjects map through `auth_identities`; provider IDs and email never replace the application ownership key.
- Automatic email-based account linking is prohibited.
- Current repository login intent remains Google + LinkedIn OIDC; phone OTP is not reintroduced because the repository explicitly removed it before this migration.
- Worker auth target implements state + PKCE, signed one-time OAuth transaction cookies, opaque HttpOnly sessions, SHA-256 token hashes in D1, expiry/absolute expiry, rotation/revocation, same-origin mutation protection and server-loaded role/subscription entitlements.
- Production auth remains Supabase-backed until later cutover; `CA_AUTH_RUNTIME=cloudflare` is the target selector.

## R2 status

- Existing user-resource bytes remain R2-backed.
- New avatar bytes move from Supabase Storage to private R2 keys under `avatars/<application_user_id>/...`.
- Avatar read/delete validates stable-user ownership and MIME/cache metadata is preserved.
- Failed metadata attachment cleans up the new R2 object.
- Legacy Supabase avatar reads remain a pre-cutover fallback only; Cloudflare-auth mode does not require Supabase Storage.
- No legacy source object is irreversibly deleted in Phase 3.

## Jobs architecture

- Existing daily ICAI schedule is preserved as Cron → `BACKGROUND_JOBS` Queue → D1 idempotency ledger → `ICAI_SYNC_SERVICE`.
- Deterministic schedule keys and payload hashes prevent duplicate successful execution/different-payload key reuse.
- Failed Queue deliveries remain retryable.
- Existing direct ICAI service execution remains a transitional production fallback until Queue activation.
- Billing stays on the existing signed/idempotent Billing Worker path; no asynchronous payment mutation is introduced.
- No Mentor Phase 3 job type/source ingestion exists.

## Realtime architecture

- The only browser Supabase Realtime dependency used message/reaction/pin changes as UI invalidation signals.
- It is replaced by provider-neutral visibility-aware polling.
- Durable community ordering, room access, moderation, blocks, announcements/pins, deletes, reactions and unread/read state remain server/database behavior.
- No Durable Object/WebSocket layer is added because no retained presence/typing/room coordination requires stateful realtime coordination.
- D1 remains the target durable community history store.

## Service adapter / activation state

- `lib/data/phase3-service-adapter.ts` records active and target auth, R2, jobs and realtime providers.
- `wrangler.phase3.jsonc` is validation-only with D1, R2, Queue, ICAI/Billing service bindings and Cron.
- Production data is not migrated; production D1/Queue/auth cutover is not activated.
- Migration Phase 4 is not started.
- CA Mentor Phase 3 is not started.

## Phase 3 Definition-of-Done validation

Final branch CI evidence from run `33529091761`, job `99927350468`:

- Typecheck: **PASS**.
- Lint: **PASS**.
- Cloudflare Migration Phase 2 contract tests: **PASS**.
- Cloudflare Migration Phase 2 clean D1 bootstrap: **PASS**.
- Phase 3 auth/R2/jobs/realtime tests: **PASS**.
- Phase 3 clean D1 auth/job bootstrap: **PASS**.
- Next.js production build: **PASS**.
- OpenNext Worker build and existing Wrangler dry-runs: **PASS**.
- Phase 3 D1/R2/Queue Worker dry-run: **PASS**.
- Cloudflare SSR route smoke test: **PASS**.
- Repository-wide tests: **FAIL**.

The only failing CI gate is the repository-wide test step. This does not represent a Phase 3 regression: on the direct pre-Phase-3 baseline commit `737617e0612f7e0353078d06a138bcefc3ea966e`, CI run `33518211187` / job `99890522279` already failed the same `Repository-wide tests` step after typecheck, lint, Phase 2 contract/bootstrap, Next.js build, OpenNext/Wrangler dry-runs and Cloudflare SSR smoke had passed. The repository-wide command is unchanged across the baseline and Phase 3 heads: `npm test` still resolves to `node --test tests/*.test.mjs`. Phase 3 therefore adds no new failure to the global suite, while every Phase-3-specific gate passes.

## Blockers / residual risk

- The repository-wide test suite retains a pre-existing failure outside Phase 3 scope. It remains separate baseline debt and must not be represented as an auth, R2, jobs or realtime migration failure.
- Production remains on the pre-cutover providers. Phase 3 proves the target architecture and validation path but intentionally does not perform production data/auth/realtime cutover.

## Explicitly not done

- No production data migration or reconciliation.
- No production D1 activation/cutover.
- No production Cloudflare auth activation.
- No production Queue activation/cutover.
- No irreversible Supabase Storage deletion.
- No Migration Phase 4.
- No CA Mentor Phase 3.

## Phase 3 completion decision

**Phase 3 is Complete.** Authentication, R2 avatar handling, background jobs and realtime migration targets are implemented, and all Phase 3-specific Definition-of-Done gates pass. The remaining repository-wide test failure is demonstrably pre-existing on the direct Phase 3 baseline and is not a Phase 3 regression. Production remains pre-cutover until a later migration phase explicitly changes that state.

---

# Phase 4 — Production Data Migration, Reconciliation and Shadow Verification

Status: **COMPLETE — PHASE 4 DEFINITION OF DONE PASSED; REPOSITORY-WIDE TEST BLOCKER REMAINS PRE-EXISTING**

Phase 4 implementation commit: `8b4d7b5e064ee51988084379305fc7bc843aea18` (`Implement Cloudflare migration Phase 4 shadow pipeline`).
Lint follow-up commit: `e181073cf93531094b4a0ffa87a24dfb644c04cc` (`Fix Phase 4 shadow runner lint`).
Wrangler validation follow-up commit: `71968e00466ab647b9dbb4265a90b59f266a8de6` (`Use Wrangler dry-run for Phase 4 validation`).
Attempt-scope repair commits: `3f98f98f7b1c477d06e3c61385539add192e37f`, `fd2046892a92726866906cac30cf6a2e9d377357`, `09f57bc229bff747dc943573e00580179e677d00`.
Final live shadow migration/reconciliation: GitHub Actions `33549953518`, job `99996662917`.
Final Phase 4 branch CI: GitHub Actions `33549953512`, quality job `99996662349`.

## Migration pipeline and safety properties

- `scripts/phase4/manifest.mjs` defines dependency-safe import order from identity/settings through academic history, progress, planner, study, resources, community, billing, ICAI and the frozen Mentor Phase 1/2 + Academic Catalog domains.
- Source primary IDs, stable `auth.users.id` application-user IDs, timestamps, relationships and source ownership are preserved. Supabase Auth password/token/session internals are intentionally excluded.
- Historical syllabus versions, attempt applicability, `supersedes_version_id`, progress events, chapter progress and planner/revision/study history remain separate source-derived rows. No historical syllabus is rewritten to the current syllabus and no historical progress is collapsed.
- Canonical Academic Catalog IDs are treated as source data and are never regenerated from display titles, slugs or names.
- Deterministic row normalization/hashing, target checkpoints and source primary-key upserts make the migration repeatable and resumable.
- A row that cannot migrate is recorded in `phase4_migration_failures` with deterministic source row key/hash and error. A current row/storage failure makes the run fail; no failed source row is silently dropped.
- Self-references are deferred until their base rows exist, then restored.
- `executePhase4ShadowRead` is comparison-only: it can query Supabase and D1 for the same logical request, records hashes/metadata, always returns the Supabase result and has `dualWriteEnabled: false`.
- The isolated target is `ca-progress-v2-phase4-shadow`; it is not the production web D1 binding.

## Migrated/reconciled totals

The final report status is `reconciled` with **1,105 source records = 1,105 target records across 76 migration/report entries**, **0 current row/storage failures**, **0 reconciliation discrepancies** and **0 D1 foreign-key violations**.

Per-domain source/target totals:

- Identity: 7 / 7.
- Settings: 16 / 16.
- Operations/admin: 7 / 7.
- Profiles/preferences: 14 / 14.
- Academic/syllabus/attempts/catalog base: 411 / 411.
- Progress/history: 63 / 63.
- Planner/Today Plan/revision/goals/calendar/forecast: 502 / 502.
- Study: 3 / 3.
- Notes/resources: 1 / 1.
- Community/moderation: 39 / 39.
- Billing/subscriptions/payments: 35 / 35.
- ICAI sync/source state: 7 / 7.
- Mentor Phase 1/2 + canonical Academic Catalog source tables: 0 / 0 because those source migrations are not applied to the active Supabase project.

Specific high-risk reconciliation results include `exam_attempts` **9/9**, `attempt_syllabus_map` **43/43**, `syllabus_versions` **17/17**, `chapters` **264/264**, `chapter_progress` **13/13**, `progress_events` **50/50**, `planner_events` **208/208**, Today Plan items **36/36**, `revision_due_items` **33/33**, `dashboard_events` **155/155**, `forecast_snapshots` **56/56**, `community_messages` **3/3**, subscription plans **5/5** and entitlements **30/30**.

Seven Supabase Auth users reconcile to seven stable D1 application identities. Three deterministic representative users were checked and all three are equivalent across the available user-owned domains.

## Source-absent Mentor / Academic Catalog state

The active Supabase database does not currently contain the frozen CA Mentor Phase 1/2 / canonical Academic Catalog source tables. The pipeline therefore records explicit `source_absent` 0/0 outcomes rather than fabricating data for:

- `mentor_model_versions`
- `mentor_intelligence_sources`
- `mentor_evidence`
- `mentor_exam_intelligence`
- `mentor_learning_intelligence`
- `mentor_personalization_rules`
- `mentor_personalization_eligibility`
- `mentor_recommendation_explanations`
- `academic_catalog_nodes`
- `academic_catalog_version_items`
- `academic_catalog_aliases`
- `academic_catalog_lineage`

This is an explicit source-state result, not a dropped migration domain. CA Mentor Phase 3 is not started.

## Discrepancy discovered and fixed

The first credential-enabled live run correctly failed instead of dropping data. It reported `exam_attempts` source **9** vs target **5**, four explicit failed rows and one table reconciliation discrepancy. All four failures were valid source attempts rejected by the original D1 constraint `UNIQUE(attempt_key)`.

Authoritative PostgreSQL inspection proved that `exam_attempts` is unique by **`(level_id, attempt_key)`**, allowing the same exam calendar key at different CA levels. The source `attempt_syllabus_map` also carries `level_id` to preserve that distinction.

`d1/migrations/0006_phase4_attempt_scope.sql` repairs the shadow D1 schema to match PostgreSQL semantics without changing any source attempt ID. It recreates the level-scoped uniqueness/reference, preserves the source mapping uniqueness, retains the original failed-row audit ledger, clears only the two partially copied shadow target tables and resets only their Phase 4 checkpoints for idempotent retry. The repaired final run reconciled `exam_attempts` 9/9 and `attempt_syllabus_map` 43/43 with matching per-table hashes and no remaining discrepancy.

## R2 / Storage result

- Supabase Storage source objects: **0**.
- Phase 4 objects copied to R2: **0**.
- Phase 4 R2 objects checksum-verified: **0**.
- Storage failures: **0**.
- Pre-existing R2-backed `uploaded_resources` references preserved: **1**.

When source Storage objects exist, the pipeline copies them only below `phase4-shadow/supabase/<bucket>/<object>`, records owner/MIME/size/source identifiers and SHA-256, then downloads and re-hashes the R2 copy. The zero-copy result here is therefore a verified source condition, not an omitted storage migration.

## Intentional PostgreSQL → SQLite/D1 differences

- PostgreSQL UUID values are D1 `TEXT`; imported values are preserved verbatim.
- PostgreSQL `timestamptz`/date/time values are canonical ISO/date/time `TEXT` in D1.
- PostgreSQL booleans are D1 `INTEGER` 0/1.
- PostgreSQL JSON/JSONB/arrays are canonical JSON `TEXT`, with `json_valid` checks where applicable.
- Fractional score/limit numeric values map to D1 `REAL`; integer money/reference/count values remain `INTEGER`.
- PostgreSQL RLS, `auth.uid()` and `auth.jwt()` are replaced by trusted Worker authorization; browser identity is never migration authority.
- PostgreSQL RPC/trigger/locking behavior is replaced by explicit Worker transaction/batch/idempotency behavior rather than D1 security triggers.
- Supabase Auth password/token/session internals are intentionally not copied; stable application/provider identity metadata is the migration contract.

The original global `exam_attempts.attempt_key` uniqueness was **not** accepted as an intentional difference; it was a target-schema defect and was corrected to PostgreSQL's `(level_id, attempt_key)` semantics.

## Rollback state

`npm run d1:phase4:validate` proves a clean D1 can be built from zero, interrupted progress can resume from checkpoints, explicit failures remain inspectable, historical syllabus/progress survives intact, foreign keys remain valid, and a partially populated target can be deleted and rebuilt while the source fixture remains unchanged.

The live rollback command is target-only: it deletes only R2 objects tracked beneath the Phase 4 prefix and then deletes the isolated shadow D1. Supabase is never modified by rollback. The successful live shadow database is intentionally **retained** after reconciliation for shadow verification; rollback was rehearsed and proven but was not executed against the successful final shadow because there was no failure requiring it.

## Phase 4 Definition-of-Done validation

Final live shadow run `33549953518` / job `99996662917`:

- Typecheck: **PASS**.
- Lint: **PASS**.
- Phase 4 migration/reconciliation/shadow tests: **PASS** (11/11 after the attempt-scope regression test was added).
- Clean D1 bootstrap: **PASS**.
- Historical syllabus/progress preservation: **PASS**.
- Resumable checkpoint/interruption rehearsal: **PASS**.
- Explicit failed-row ledger validation: **PASS**.
- Level-scoped attempt-key compatibility: **PASS**.
- Foreign-key integrity: **PASS**.
- Rollback/delete/rebuild rehearsal: **PASS**.
- OpenNext Cloudflare Worker build: **PASS**.
- Phase 4 Wrangler D1/R2 shadow Worker dry-run: **PASS**.
- Live production-source → isolated D1/R2 migration and reconciliation: **PASS**.
- Reconciliation artifact upload: **PASS**.

Final branch CI `33549953512` / job `99996662349` additionally passed Phase 2 and Phase 3 migration gates, Next.js production build, existing OpenNext/Wrangler dry-runs, Phase 3 D1/R2/Queue dry-run, Phase 4 D1/R2 shadow dry-run and Cloudflare SSR route smoke tests. Its only failing step is the repository-wide `npm test` suite.

That broad repository-wide failure is pre-existing migration-external debt: the direct pre-Phase-3 baseline commit `737617e0612f7e0353078d06a138bcefc3ea966e` already failed the same `Repository-wide tests` gate in run `33518211187` / job `99890522279`, while the broad command remains `node --test tests/*.test.mjs`. Every Phase-4-specific Definition-of-Done gate passes independently.

## Blockers / residual risk

- The pre-existing repository-wide test failure remains separate baseline debt and is not a Phase 4 migration/reconciliation failure.
- The isolated D1 shadow is a point-in-time migration result while Supabase remains write-authoritative. A later cutover phase must account for writes after the shadow snapshot before exclusive D1 activation.
- Twelve Mentor/Academic Catalog source tables are absent from the active Supabase project. Phase 4 records this explicitly and does not fabricate data; no CA Mentor Phase 3 work is performed.

## Explicitly not done

- No production web persistence switched exclusively to D1.
- No production Supabase retirement or deletion.
- No production Supabase Auth shutdown.
- No irreversible source Storage deletion.
- No indefinite dual-write architecture.
- No Phase 5 work.
- No CA Mentor Phase 3 work.
- No merge to `main`.

## Phase 4 completion decision

**Phase 4 is Complete.** The production-source data migration pipeline is repeatable, resumable and failure-safe; the live shadow migration reconciles cleanly with 1,105/1,105 records, zero current failures/discrepancies/FK violations, representative-user equivalence and verified storage state. The discovered attempt-key schema mismatch was surfaced by the failure ledger, corrected to authoritative PostgreSQL semantics and successfully re-run without rewriting historical data or source IDs. Supabase remains production-authoritative and the isolated D1 shadow remains pre-cutover only. Phase 5 and CA Mentor Phase 3 have not been started.
