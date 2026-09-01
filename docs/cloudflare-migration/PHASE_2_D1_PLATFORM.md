# Cloudflare Migration Phase 2 — D1 Data and Authorization Platform

Status: **IMPLEMENTED — NOT CUT OVER**

Freeze baseline: `a319690718454caa11edebdf4b32a5730071a02d` (Migration Phase 1 / CA Mentor Phase 2 freeze point).

This phase creates the target D1 logical model, authorization policy, operation replacement map, adapter contract and local D1 validation. Supabase remains the production database and authentication provider. No production rows are copied by this phase.

## 1. Scope and invariants

Phase 2 covers every active logical domain from the Phase 1 audit: identity mapping, profiles/preferences, academic engine, syllabus/attempt applicability, chapters/topics/Accounting Standards, canonical Academic Catalog, progress/events, planner/Today Plan/revision/goals/calendar, study sessions/timer, notes/resources metadata, community/moderation, plans/subscriptions/entitlements/payment state, ICAI sync metadata, app settings, Mentor Phase 1 and Mentor Phase 2.

Hard invariants:

- Imported IDs are stored as `TEXT` and preserved verbatim.
- New target-side UUIDs will be created by trusted Worker code with `crypto.randomUUID()`; D1 defaults do not regenerate imported IDs.
- Mentor Phase 2 `academic_catalog_nodes.canonical_id` is stored data and is never derived from mutable titles/names during migration.
- Historical `syllabus_versions`, `attempt_syllabus_map`, version items, aliases, lineage, `chapter_progress` and `progress_events` remain separate historical records.
- `supersedes_version_id` and explicit item lineage are preserved; historical rows are not rewritten onto the current syllabus.
- Supabase remains the active persistence/auth provider until a later cutover phase.

## 2. D1 migration layout

Validation-only config: `wrangler.d1.phase2.jsonc`

Migrations:

1. `d1/migrations/0001_phase2_platform.sql` — identity, profiles, academic engine, progress, planner, study, notes/resources, community, ICAI, app settings.
2. `d1/migrations/0002_phase2_billing_mentor_catalog.sql` — subscriptions/billing, Mentor Phase 1, canonical Academic Catalog Phase 2, query-critical indexes.
3. `d1/migrations/0003_phase2_authorization_identity.sql` — application role projection for trusted authorization.

Both Wrangler's own `d1_migrations` table and `_ca_schema_migrations` are retained. Wrangler controls application order; the CA table records the source freeze commit and logical purpose.

## 3. PostgreSQL -> D1 compatibility decisions

| PostgreSQL/Supabase behavior | Phase 2 target |
|---|---|
| RLS / policies | Removed as DB security boundary. Trusted Worker/service authorization must pass before D1 query execution. |
| `auth.uid()` | Trusted session `actor.userId`. Browser/query/body user IDs cannot establish identity. |
| `auth.jwt()` role claims | Trusted session role plus application-role projection where required. |
| `uuid` / `gen_random_uuid()` | Preserve imported IDs as `TEXT`; Worker creates new IDs with `crypto.randomUUID()`. |
| `jsonb` | Valid JSON stored as `TEXT`; parse/stringify in services and `json_valid()` checks where practical. |
| PostgreSQL arrays | JSON arrays in `TEXT`; Worker/`json_each` logic replaces array operators. |
| `timestamptz` | UTC ISO-8601 `TEXT`; timezone/calendar logic belongs in Worker services. |
| `numeric` | `INTEGER` for counts/payment subunits; `REAL` for scores/limits when exact decimal arithmetic is not required. |
| `FOR UPDATE` | Typed service transaction/idempotency workflow; D1 batches where operations can be atomic together. |
| advisory locks | Service idempotency/serialization. Durable Objects are not introduced unless later concurrency tests prove they are required. |
| PL/pgSQL / RPCs | Typed Worker/service methods listed in `lib/data/d1/operation-map.ts`. |
| triggers | Explicit service mutations. D1 triggers are not used for authorization; mechanical triggers only if later justified. |
| GIN/full-text indexes | Not copied. Scalar/composite indexes are present; SQLite FTS can be added only when product search needs it. |
| partial/expression indexes | SQLite partial/expression indexes retained where useful/supported. |
| foreign keys | `PRAGMA foreign_keys=ON` and explicit delete semantics. |
| `ON CONFLICT` | SQLite `ON CONFLICT` on explicit unique keys. |
| `RETURNING` | Typed D1 operations may use supported `RETURNING`; otherwise a follow-up read is explicit. |

The executable mapping is `lib/data/d1/operation-map.ts`.

## 4. Authorization replacement

Authorization implementation: `lib/data/authorization.ts`.

Actor identity has only two trusted origins:

- `TrustedSessionActor`: established by server-side session verification.
- `TrustedServiceActor`: established by an internal Worker service binding.

A browser-supplied `userId` is never an authorization source. Ownership uses the trusted actor and a persisted owner ID.

### Matrix

| Area | Student | Moderator | Admin | Owner / Parent owner | Internal service |
|---|---|---|---|---|---|
| Public academic/ICAI/published Mentor reads | Read | Read | Read | Read | Read |
| Own profile/preferences/progress/planner/study | Own read/write | Own read/write | Own read/write | Own read/write | Service task only |
| Own notes/resource metadata | Own read/write | Own + moderation | Own + moderation | Own + moderation | Service task only |
| Community normal posting | Allowed if channel policy permits | Same | Same | Same | System task only |
| Community moderation | No | Yes | Yes | Yes | Explicit system operation only |
| Private app settings | No | No | Read/write | Read/write | System only where declared |
| Subscription/payment state | Own read only | Own read only | Own read; admin tools by explicit policy | Own/admin read | Billing service writes |
| ICAI mutation/sync | No | No | Review decision only | Review decision only | ICAI sync service writes |
| Mentor model/evidence publication | No | No | Administrative read where exposed | Administrative read where exposed | Mentor/system service writes |
| Parent-owner-only role administration | No | No | No | Parent owner only | Explicit system workflow |

Entitlement checks are applied after trusted identity and before paid-feature work.

## 5. RPC/function/trigger replacement

`lib/data/d1/operation-map.ts` maps the active Postgres behavior, including:

- progress applicability, stage transition and undo;
- study timer start/pause/resume/touch/finish/discard;
- resource create/update/delete/report/moderation and note/tag save;
- revision-rule update and revision schedule side effects;
- community visibility/write access, message sequencing, read state, reports, reactions and moderation;
- ICAI source batch/apply/failure/unchanged/review workflows;
- billing duration, current plan, entitlement and idempotent payment reconciliation;
- Mentor personalization eligibility;
- canonical catalog legacy/applicability/alias resolvers;
- updated-at/channel/revision trigger behavior.

No security-sensitive behavior is implemented as a D1 trigger.

## 6. Repository adapter

- `lib/data/d1/adapter.ts` defines a D1-like interface independent of Cloudflare ambient types and implements representative typed operations for public catalog reads, actor-owned profile/progress operations, community moderation, subscriptions, billing, ICAI and Mentor service-only writes.
- `lib/data/phase2-contract.ts` gives both the frozen Supabase logical contract and the D1 target contract the same authorization behavior. Contract tests compare these boundaries without changing the runtime provider.
- `lib/data/migration-contract.ts` records Phase 2 as prepared while `activePersistence` remains `supabase` and `d1ProductionActivated` remains false.

## 7. Clean bootstrap, rebuild and rollback

Run a clean local D1 bootstrap:

```bash
npm run d1:phase2:validate
```

The validator creates a temporary local persistence directory, applies all D1 migrations with Wrangler, validates key tables, runs `PRAGMA foreign_key_check`, and re-applies migrations to verify migration tracking/idempotency. The temporary database is deleted afterward.

Rebuild during Phase 2 is safe because no remote/production D1 database is used: delete the local validation state (the validator already uses a fresh temporary directory) and re-run the command.

Rollback policy for this phase is source rollback, not data rollback: revert the Phase 2 commit and rebuild a fresh local D1. Production Supabase is unchanged. When a later phase introduces remote D1 data, rollback must use an explicit backup/time-travel/cutover runbook rather than reverse destructive SQL.

## 8. Runtime/binding contract

Existing production bindings remain unchanged:

- web Worker: `ca-progress-v2`
- R2: `USER_RESOURCES_R2`
- service binding: `ICAI_SYNC_SERVICE`
- service binding: `BILLING_SERVICE`
- ICAI cron: existing schedule
- Supabase service role: still required during Phase 2

Phase-2-only validation binding:

- `DB` -> local `ca-progress-v2-phase2-local` via `wrangler.d1.phase2.jsonc`

Not activated/created for production in this phase:

- production D1 binding
- migration queue
- KV
- Durable Objects
- Hyperdrive

Hyperdrive remains an optional temporary bridge only; it is not the final application data layer.

## 9. Definition-of-Done tests

Phase 2 adds:

- `tests/cloudflare-migration-phase2.test.mjs` — schema coverage, canonical ID invariants, historical syllabus/progress preservation, authorization, contract parity, operation mapping, indexes, no-cutover guards.
- `scripts/validate-d1-phase2.mjs` — real Wrangler local D1 zero-to-current bootstrap / FK / repeat-apply validation.

CI runs the targeted Phase 2 test and D1 bootstrap before the repository-wide `npm test` step so this phase can be evaluated independently of the known pre-existing global test blocker.

## 10. Explicit non-goals / stop point

Phase 2 does **not**:

- migrate live production rows;
- switch production reads or writes to D1;
- replace Supabase Auth;
- replace Supabase Realtime;
- bind production `DB`;
- add source ingestion;
- start Cloudflare Migration Phase 3;
- start CA Mentor Phase 3.
