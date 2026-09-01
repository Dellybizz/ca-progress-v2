import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hashRows, normalizeRow, splitSqlStatements } from "../scripts/phase4/core.mjs";
const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const migration=read("d1/migrations/0005_phase4_migration_shadow.sql");
const attemptCompatibility=read("d1/migrations/0006_phase4_attempt_scope.sql");
const manifest=read("scripts/phase4/manifest.mjs");
const pipeline=read("scripts/phase4/production-shadow.mjs");
const shadow=read("lib/data/phase4-shadow-read.ts");
const docs=read("docs/cloudflare-migration/PHASE_4_DATA_MIGRATION.md");

test("Phase 4 schema records resumable checkpoints, explicit failures, storage mappings and shadow comparisons",()=>{
  for(const table of ["phase4_migration_runs","phase4_migration_checkpoints","phase4_migration_failures","phase4_storage_objects","phase4_shadow_comparisons"]) assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(migration,/PRIMARY KEY\(run_id,source_table,target_table\)/);
  assert.match(migration,/row_key TEXT NOT NULL/);
  assert.match(migration,/sha256 TEXT/);
});

test("active operational/profile source fields missing from Phase 2 are represented in D1",()=>{
  for(const value of ["admin_users","admin_audit_logs","feature_flags","maintenance_settings","notification_templates","primary_use","feature_guide_completed_at","primary_use_priority"]) assert.match(migration,new RegExp(value));
});

test("migration manifest is dependency ordered and preserves historical/canonical domains",()=>{
  const required=["syllabus_versions","attempt_syllabus_map","chapter_progress","progress_events","daily_plans","revision_due_items","study_sessions","uploaded_resources","community_messages","user_subscriptions","payment_events","icai_sync_runs","academic_catalog_nodes","academic_catalog_aliases","academic_catalog_lineage","mentor_model_versions","mentor_recommendation_explanations"];
  for(const table of required) assert.match(manifest,new RegExp(`source:\"${table}\"`));
  assert.match(manifest,/syllabus_versions[^\n]*deferred:\[\"supersedes_version_id\"\]/);
  assert.match(manifest,/progress_events[^\n]*deferred:\[\"reverts_event_id\"\]/);
  assert.match(manifest,/academic_catalog_nodes[^\n]*optionalSource:true[^\n]*deferred:\[\"parent_canonical_id\"\]/);
});

test("pipeline preserves stable auth IDs and excludes password/token internals",()=>{
  assert.match(pipeline,/user_id:user\.id/);
  assert.match(pipeline,/application_user_id:user\.id/);
  assert.match(pipeline,/provider:\"supabase_auth\"/);
  assert.doesNotMatch(pipeline,/encrypted_password|confirmation_token|recovery_token|refresh_token/);
});

test("pipeline records every row failure and refuses source columns missing from D1",()=>{
  assert.match(pipeline,/recordFailure/);
  assert.match(pipeline,/phase4_migration_failures/);
  assert.match(pipeline,/Source columns absent from D1 target/);
  assert.match(pipeline,/throw new Error\(`Required source table/);
});

test("Phase 4 repairs exam-attempt uniqueness to match level-scoped PostgreSQL semantics",()=>{
  assert.match(attemptCompatibility,/UNIQUE\(level_id, attempt_key\)/);
  assert.match(attemptCompatibility,/FOREIGN KEY\(level_id, attempt_key\) REFERENCES exam_attempts\(level_id, attempt_key\)/);
  assert.match(attemptCompatibility,/FOREIGN KEY\(subject_id, syllabus_version_id\) REFERENCES syllabus_versions\(subject_id, id\)/);
  assert.match(attemptCompatibility,/UNIQUE\(attempt_key, syllabus_version_id\)/);
  assert.match(attemptCompatibility,/WHERE source_table IN \('exam_attempts','attempt_syllabus_map'\)/);
  assert.doesNotMatch(attemptCompatibility,/DELETE FROM phase4_migration_failures/);
});

test("deterministic hashes are order stable and value normalization is explicit",()=>{
  const a=[normalizeRow({id:"b",flag:true,payload:{z:1,a:2}}),normalizeRow({id:"a",flag:false,payload:{a:2,z:1}})];
  const b=[...a].reverse(); assert.equal(hashRows(a,["id"]),hashRows(b,["id"])); assert.equal(a[0].flag,1); assert.equal(a[1].flag,0); assert.equal(a[0].payload,'{"a":2,"z":1}');
});

test("SQL migration splitter does not split semicolons inside strings",()=>{assert.equal(splitSqlStatements("INSERT INTO t(v) VALUES('a;b'); SELECT 1;").length,2);});

test("shadow mode is comparison-only and always serves the Supabase result",()=>{
  assert.match(shadow,/productionResultProvider: \"supabase\"/);
  assert.match(shadow,/comparisonOnly: true/);
  assert.match(shadow,/dualWriteEnabled: false/);
  assert.match(shadow,/return sourceResult/);
  assert.match(shadow,/CA_PHASE4_SHADOW_READ/);
  assert.doesNotMatch(shadow,/targetResult\s*;\s*$/m);
});

test("R2 migration is checksummed, prefixed for rollback and metadata-mapped",()=>{
  assert.match(pipeline,/phase4-shadow\/supabase/);
  assert.match(pipeline,/sha256\(bytes\)/);
  assert.match(pipeline,/R2 checksum mismatch/);
  assert.match(pipeline,/phase4_storage_objects/);
});

test("Phase 4 documentation explicitly forbids cutover, history rewriting and Mentor Phase 3",()=>{
  assert.match(docs,/Supabase remains the production source of truth/i);
  assert.match(docs,/never rewrites historical syllabus/i);
  assert.match(docs,/canonical academic IDs/i);
  assert.match(docs,/CA Mentor Phase 3 is not started/i);
  assert.match(docs,/Phase 5 is not started/i);
});
