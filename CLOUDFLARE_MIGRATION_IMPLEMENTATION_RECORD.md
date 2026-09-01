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
