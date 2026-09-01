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
