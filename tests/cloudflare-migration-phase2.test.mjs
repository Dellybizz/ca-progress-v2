import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const m1 = read("d1/migrations/0001_phase2_platform.sql");
const m2 = read("d1/migrations/0002_phase2_billing_mentor_catalog.sql");
const schema = `${m1}\n${m2}`;
const auth = read("lib/data/authorization.ts");
const adapter = read("lib/data/d1/adapter.ts");
const contract = read("lib/data/phase2-contract.ts");
const operationMap = read("lib/data/d1/operation-map.ts");
const migrationContract = read("lib/data/migration-contract.ts");

const activeTables = [
  "app_settings","profiles","user_preferences","course_levels","course_groups","subjects","syllabus_versions","exam_attempts","chapters","topics","attempt_syllabus_map","academic_change_events",
  "chapter_progress","progress_events","planner_events","daily_plans","daily_plan_items","revision_rules","revision_due_items","tasks","goals","user_calendar_events","dashboard_events","forecast_snapshots",
  "study_sessions","study_timer_state","notes","note_tags","note_tag_map","uploaded_resources","resource_subject_map","resource_attempt_map","resource_reports","resource_moderation",
  "community_channels","community_messages","community_message_mentions","message_reactions","pinned_messages","channel_read_state","community_notifications","message_reports","chat_blocks","moderation_actions",
  "icai_sources","icai_sync_runs","icai_source_snapshots","icai_resources","exam_events","icai_change_events","icai_review_queue","system_health_log",
  "subscription_plans","plan_entitlements","user_subscriptions","payment_orders","payment_events","subscription_events",
  "mentor_model_versions","mentor_intelligence_sources","mentor_evidence","mentor_exam_intelligence","mentor_learning_intelligence","mentor_personalization_rules","mentor_personalization_eligibility","mentor_recommendation_explanations",
  "academic_catalog_nodes","academic_catalog_version_items","academic_catalog_aliases","academic_catalog_lineage"
];

test("Phase 2 D1 schema covers every active logical domain table", () => {
  assert.match(schema,/CREATE TABLE IF NOT EXISTS app_users/);
  for (const table of activeTables) assert.match(schema,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`),`missing ${table}`);
});

test("canonical Academic Catalog identity is stored verbatim and never generated from titles", () => {
  assert.match(m2,/canonical_id TEXT PRIMARY KEY/);
  assert.match(m2,/canonical_id is DATA, not a\s*-- generated expression/i);
  assert.doesNotMatch(m2,/lower\(title\).*canonical|canonical.*lower\(title\)/i);
  assert.match(m2,/academic_catalog_version_items/);
  assert.match(m2,/academic_catalog_aliases/);
  assert.match(m2,/academic_catalog_lineage/);
});

test("historical syllabus and progress identities coexist", () => {
  assert.match(m1,/supersedes_version_id TEXT REFERENCES syllabus_versions/);
  assert.match(m1,/UNIQUE\(syllabus_version_id, stable_key\)/);
  assert.match(m1,/CREATE TABLE IF NOT EXISTS attempt_syllabus_map/);
  assert.match(m1,/CREATE TABLE IF NOT EXISTS chapter_progress/);
  assert.match(m1,/CREATE TABLE IF NOT EXISTS progress_events/);
  assert.match(m2,/source_syllabus_version_id/);
  assert.match(m2,/target_syllabus_version_id/);
});

test("Worker authorization replaces RLS and browser user ids cannot establish identity", () => {
  assert.match(auth,/source: "trusted-session"/);
  assert.match(auth,/source: "service-binding"/);
  assert.match(auth,/requireOwnership/);
  assert.match(auth,/requireModerator/);
  assert.match(auth,/requireAdmin/);
  assert.match(auth,/requireService/);
  assert.match(auth,/Browser-supplied user identity cannot authorize this request/);
  assert.doesNotMatch(schema,/ROW LEVEL SECURITY|CREATE POLICY|auth\.uid\(|auth\.jwt\(/i);
});

test("Supabase and D1 contract adapters share one logical authorization policy", () => {
  assert.match(contract,/SUPABASE_PHASE2_CONTRACT/);
  assert.match(contract,/D1_PHASE2_CONTRACT/);
  assert.match(contract,/authorize: authorizeCommon/g);
  assert.match(contract,/"identity","profiles","academic","progress","planner","study","resources","community","billing","icai","mentor"/);
});

test("D1 adapter scopes user operations to trusted actor and service writes to bindings", () => {
  assert.match(adapter,/WHERE user_id=\?1/);
  assert.match(adapter,/ctx\.actor\.userId/);
  assert.match(adapter,/requireModerator\(ctx\.actor\)/);
  assert.match(adapter,/requireService\(ctx\.actor,\["billing"\]\)/);
  assert.match(adapter,/requireService\(ctx\.actor,\["icai-sync"\]\)/);
  assert.match(adapter,/requireService\(ctx\.actor,\["mentor","system"\]\)/);
});

test("PostgreSQL RPC and trigger behavior has explicit Cloudflare replacements", () => {
  for (const op of [
    "progress_set_stage","progress_undo_event","study_timer_start","phase7_save_note","phase9_set_revision_rules",
    "phase10_create_message","phase10_moderate","icai_sync_apply_source_batch","icai_review_decide",
    "phase11_reconcile_payment","mentor_personalization_is_eligible","academic_catalog_resolve_legacy",
    "academic_catalog_is_applicable","academic_catalog_resolve_alias","academic_catalog_resolve_alias_one"
  ]) assert.match(operationMap,new RegExp(op));
  for (const behavior of ["rls","authUid","uuidDefault","jsonb","arrays","forUpdate","advisoryLocks","foreignKeys","upsert"]) assert.match(operationMap,new RegExp(`${behavior}:`));
});

test("major user, academic, community, billing, ICAI and Mentor access paths are indexed", () => {
  for (const index of ["progress_user_updated_idx","daily_plan_items_schedule_idx","revision_due_user_due_idx","community_messages_channel_sequence_idx","icai_review_status_idx","user_subscriptions_current_idx","mentor_personalization_state_idx","academic_catalog_alias_lookup_idx","academic_catalog_lineage_predecessor_idx"]) assert.match(m2,new RegExp(index));
});

test("Phase 2 remains non-cutover and does not start either Phase 3", () => {
  assert.match(migrationContract,/activePersistence: "supabase"/);
  assert.match(migrationContract,/d1ProductionActivated: false/);
  assert.match(migrationContract,/productionDataMigrated: false/);
  assert.match(migrationContract,/mentorPhase3Started: false/);
  assert.match(migrationContract,/migrationPhase3Started: false/);
});
