# Cloudflare Migration Phase 4 — Production Data Migration, Reconciliation and Shadow Verification

## Safety boundary

Phase 4 builds and runs a production-data **shadow migration**. Supabase remains the production source of truth and the web application is not switched exclusively to D1. No Supabase table, auth identity, Storage object or RLS policy is deleted. Phase 5 is not started. CA Mentor Phase 3 is not started.

The target is the isolated D1 database `ca-progress-v2-phase4-shadow`. It is deliberately not bound as the production web persistence database. Supabase-backed feature writes remain authoritative during Phase 4.

## Invariants

- Existing Supabase `auth.users.id` values become `app_users.user_id` unchanged.
- Provider identity is stored separately in `auth_identities`; password hashes, recovery/confirmation tokens and Supabase session internals are never exported.
- Source primary IDs and timestamps are imported, not regenerated.
- The pipeline never rewrites historical syllabus rows into a current syllabus and never collapses `progress_events` or `chapter_progress` history.
- `academic_catalog_nodes.canonical_id` is migrated as data. The pipeline never regenerates canonical academic IDs from titles, slugs or display labels.
- Aliases, version applicability and lineage are independent rows and retain their IDs/references.
- A failed row is written to `phase4_migration_failures` with source table, deterministic row key/hash and error. Any row/storage failure makes the run fail.

## Dependency order and resumability

`scripts/phase4/manifest.mjs` is the authoritative dependency order: identity first; operational settings/profiles; academic versions/attempts; progress; planner/Today Plan/revision/goals/calendar; study; notes/resources; community/moderation; billing/subscriptions/payments; ICAI; then Mentor Phase 1/2 and canonical Academic Catalog data when those tables exist on the source.

Each table persists a checkpoint in `phase4_migration_checkpoints` with source count/hash, next offset, migrated/failed counts and target hash. A rerun of the same run ID resumes from the stored offset. A completed table is skipped only when its deterministic source hash is unchanged; otherwise the pipeline fails and requires a new run ID. Upserts are keyed only by preserved source primary keys. Nullable self-references (`supersedes_version_id`, progress reverts, replies, replaced resources and catalog parents) are restored in a second pass after base rows exist.

## Source-absent Mentor state

The migration manifest contains all CA Mentor Phase 1 and Phase 2 target tables. If those source migrations are not yet applied to the active Supabase database, the pipeline records `source_absent` with zero source rows instead of fabricating Mentor records or pretending that data was migrated. A non-empty D1 target for a source-absent Mentor table is a reconciliation discrepancy.

## Storage / R2

Supabase Storage objects, when present, are downloaded with the service role, SHA-256 hashed, copied beneath `phase4-shadow/supabase/<bucket>/<object>` in the existing private R2 bucket, downloaded again and checksum verified. Ownership, MIME/size metadata and source→R2 mapping are stored in `phase4_storage_objects`. The Phase 4 prefix keeps rollback surgical and does not mutate existing R2-backed `uploaded_resources` paths.

## Reconciliation

Every migrated table compares source and target row counts and deterministic row hashes over the source column set. `PRAGMA foreign_key_check` must be empty. Representative users are selected deterministically by hashed stable user ID and compared across profile, progress history, planner/Today Plan/revision, study, resources/community, subscriptions/payments and Mentor personalization tables when available. Reports contain hashed representative user identifiers rather than email/phone values.

The temporary read helper `executePhase4ShadowRead` can run equivalent provider-neutral repository requests against Supabase and D1 when `CA_PHASE4_SHADOW_READ=1`. It hashes both logical results, emits only comparison metadata, and **always returns the Supabase result**. It performs no target writes and is removed by disabling one environment flag. There is no indefinite dual-write architecture in Phase 4.

## Intentional PostgreSQL → SQLite/D1 differences

1. PostgreSQL UUID → D1 `TEXT`; imported UUID strings stay byte-for-byte logically identical.
2. `timestamptz`/date/time → canonical `TEXT`; timezone-bearing source values retain their serialized instant.
3. Boolean → `INTEGER` (`0`/`1`).
4. JSON/JSONB and PostgreSQL arrays → canonical JSON `TEXT`; schema checks use `json_valid` where applicable.
5. Score/limit numerics → `REAL` where fractional values are needed; integer IDs, counts and money subunits remain `INTEGER`.
6. PostgreSQL RLS plus `auth.uid()`/`auth.jwt()` → trusted Worker authorization already defined by Phase 2/3. Migration input never establishes actor identity from browser data.
7. PostgreSQL RPC/trigger/locking behavior → explicit Worker transaction, batch and idempotency behavior; D1 triggers are not a security boundary.
8. Supabase Auth secrets/session internals have no D1 analogue and are intentionally excluded; stable identity/provider metadata is the migration contract.

`exam_attempts.attempt_key` is **not** an intentional semantic difference. The first live run exposed that the original D1 schema had made `attempt_key` globally unique while PostgreSQL defines uniqueness as `(level_id, attempt_key)`. Migration `0006_phase4_attempt_scope.sql` repairs the D1 shadow target to the authoritative PostgreSQL semantics, keeps source attempt IDs unchanged, adds the level-scoped composite reference used by `attempt_syllabus_map`, retains the failed-row audit ledger, and resets only the two affected migration checkpoints for idempotent retry.

## Rollback

Before cutover, rollback is target-only: delete only R2 keys recorded in `phase4_storage_objects` under the Phase 4 prefix, then delete/recreate the isolated Phase 4 D1 shadow database. Supabase remains untouched and authoritative, so no reverse data migration is required. `npm run d1:phase4:validate` rehearses this by deleting a partially populated local D1, rebuilding from zero, and verifying the source fixture remains unchanged.

The live pipeline supports `--rollback`; it deletes only tracked Phase 4 R2 objects before deleting the isolated shadow D1 database. It must never be pointed at a production-bound D1 database.

## Live shadow execution result

Final live execution used run ID `phase4-production-shadow-v1` against the isolated D1 database `ca-progress-v2-phase4-shadow`. GitHub Actions run `33549953518`, job `99996662917`, completed with the production-source migration and reconciliation step passing.

- 76 migration/report entries were checked.
- 1,105 source records reconciled to 1,105 target records.
- 7 Supabase Auth users reconciled to 7 stable D1 application identities.
- 0 current row/storage failures, 0 reconciliation discrepancies and 0 D1 foreign-key violations remained.
- 3 deterministic representative users were compared and all were equivalent.
- Supabase Storage contained 0 source objects, so 0 objects required copying or checksum verification; 1 existing `uploaded_resources` record already referenced R2 and remained intact.
- Academic reconciliation includes `exam_attempts` 9/9 and `attempt_syllabus_map` 43/43 after the level-scoped attempt-key repair.
- Twelve Mentor/Academic Catalog source tables were absent from the active Supabase schema and reconciled as explicit `source_absent` 0/0 rather than fabricated data: `mentor_model_versions`, `mentor_intelligence_sources`, `mentor_evidence`, `mentor_exam_intelligence`, `mentor_learning_intelligence`, `mentor_personalization_rules`, `mentor_personalization_eligibility`, `mentor_recommendation_explanations`, `academic_catalog_nodes`, `academic_catalog_version_items`, `academic_catalog_aliases` and `academic_catalog_lineage`.

The successful shadow D1 is retained for pre-cutover comparison. Production remains Supabase-authoritative; no production D1 cutover, Supabase retirement, Phase 5 work or CA Mentor Phase 3 work is performed by this result.
