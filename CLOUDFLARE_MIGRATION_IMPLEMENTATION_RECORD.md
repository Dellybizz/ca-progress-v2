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

Status: **IMPLEMENTED — VALIDATION PENDING**

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

## Tests introduced

- `tests/cloudflare-migration-phase2.test.mjs` — full table/domain coverage, canonical ID guard, historical syllabus/progress preservation, authorization guard, Supabase/D1 contract parity, operation replacement coverage, major indexes and no-cutover/Phase-3 guards.
- `npm run d1:phase2:validate` — clean local Wrangler D1 migration bootstrap, FK check, migration reapply.
- CI orders Phase 2 targeted tests/bootstrap before repository-wide `npm test`, allowing Phase 2 failures to be distinguished from the pre-existing global test blocker.

## Explicitly not done

- No live/production data migration.
- No production reads/writes switched to D1.
- No production `DB` binding created/activated.
- No Supabase Auth replacement.
- No Supabase Realtime replacement.
- No Hyperdrive final data layer.
- No Migration Phase 3.
- No CA Mentor Phase 3.

## Validation

Pending execution against the Phase 2 commit. Final results and any blockers will be recorded after branch CI/build evidence is available.
