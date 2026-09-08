import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const wrangler = process.platform === "win32" ? "npx.cmd" : "npx";
const database = "ca-progress-v2-retirement-validation";
const persistTo = mkdtempSync(join(tmpdir(), "ca-progress-d1-indexes-"));
const configPath = join(process.cwd(), `.wrangler-d1-validation-${process.pid}.json`);
const seededSourceIds = [
  "icai-final-course",
  "icai-foundation-course",
  "icai-intermediate-course",
  "icai-exam-may-2026",
  "icai-exam-sep-nov-2026",
  "icai-bos-important-announcements",
];

function run(args) {
  return execFileSync(wrangler, [...base, ...args], {
    cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "1", NO_D1_WARNING: "true" },
  });
}
const base = ["wrangler", "--config", configPath];
function execute(sql) {
  const raw = run(["d1", "execute", database, "--local", "--persist-to", persistTo, "--command", sql, "--json"]);
  return JSON.parse(raw)?.[0]?.results ?? [];
}
function assert(condition, message) { if (!condition) throw new Error(message); }

const expectedIndexes = [
  "idx_sessions_token_active",
  "idx_progress_events_user_chapter_created", "idx_study_sessions_user_ended",
  "idx_tasks_user_status_due", "idx_community_messages_channel_status_sequence",
  "idx_channel_read_state_channel_user_sequence",
  "idx_message_reactions_message_user_emoji",
  "idx_pinned_messages_channel_pinned_message",
  "idx_uploaded_resources_visibility_moderation_published",
  "idx_user_subscriptions_user_status_dates",
  "idx_plan_entitlements_plan_enabled_feature",
];

const plans = [
  ["session token", "SELECT session_id FROM sessions WHERE token_hash='hash' AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP AND absolute_expires_at>CURRENT_TIMESTAMP LIMIT 1", "sqlite_autoindex_sessions_"],
  ["progress events", "SELECT id FROM progress_events WHERE user_id='u' AND chapter_id='c' ORDER BY created_at DESC LIMIT 20", "idx_progress_events_user_chapter_created"],
  ["study sessions", "SELECT id FROM study_sessions WHERE user_id='u' ORDER BY ended_at DESC LIMIT 40", "idx_study_sessions_user_ended"],
  ["tasks", "SELECT id FROM tasks WHERE user_id='u' AND status='todo' ORDER BY due_at LIMIT 250", "idx_tasks_user_status_due"],
  ["community messages", "SELECT id FROM community_messages WHERE channel_id='c' AND moderation_status IN ('active','moderated') ORDER BY sequence_id DESC LIMIT 41", "community_messages_channel_sequence_idx"],
  ["read state", "SELECT last_read_sequence FROM channel_read_state WHERE channel_id='c' AND user_id='u' LIMIT 1", "sqlite_autoindex_channel_read_state_1"],
  ["reactions", "SELECT emoji FROM message_reactions WHERE message_id='m' AND user_id='u'", "idx_message_reactions_message_user_emoji"],
  ["pins", "SELECT message_id FROM pinned_messages WHERE channel_id='c' ORDER BY pinned_at DESC LIMIT 1", "idx_pinned_messages_channel_pinned_message"],
  ["resources", "SELECT id FROM uploaded_resources WHERE visibility='shared' AND moderation_status='approved' ORDER BY published_at DESC LIMIT 80", "idx_uploaded_resources_visibility_moderation_published"],
  ["subscriptions", "SELECT plan_id FROM user_subscriptions WHERE user_id='u' AND status='active' ORDER BY starts_at DESC LIMIT 1", "idx_user_subscriptions_user_status_dates"],
  ["entitlements", "SELECT feature_key FROM plan_entitlements WHERE plan_id='p' AND enabled=1", "idx_plan_entitlements_plan_enabled_feature"],
];

try {
  writeFileSync(configPath, JSON.stringify({
    name: "ca-progress-v2-d1-validation",
    compatibility_date: "2026-08-29",
    d1_databases: [{
      binding: "DB",
      database_name: database,
      database_id: "6f002cbe-fe40-4d1b-9cf4-df6faaf52350",
      migrations_dir: "d1/migrations",
      migrations_table: "d1_migrations",
    }],
  }, null, 2));

  // The production deploy path is ledger-aware: already-applied retained migrations
  // are skipped rather than replayed against a newer schema. Wrangler's journal gives
  // the equivalent fresh-database proof here, so applying the complete migration set
  // twice must be a no-op on the second pass.
  run(["d1", "migrations", "apply", database, "--local", "--persist-to", persistTo]);
  run(["d1", "migrations", "apply", database, "--local", "--persist-to", persistTo]);

  const indexes = execute("SELECT name FROM sqlite_master WHERE type='index';").map((row) => row.name);
  for (const name of expectedIndexes) assert(indexes.includes(name), `Missing index ${name}`);

  for (const [label, sql, expected] of plans) {
    const details = execute(`EXPLAIN QUERY PLAN ${sql};`).map((row) => String(row.detail ?? row["3"] ?? ""));
    assert(details.some((detail) => detail.includes(expected)), `${label} plan did not use ${expected}: ${details.join(" | ")}`);
  }

  assert(execute("PRAGMA foreign_key_check;").length === 0, "D1 foreign-key check failed");
  const migrationRows = execute("SELECT name FROM d1_migrations WHERE name='0009_phase5_hot_query_indexes.sql';");
  assert(migrationRows.length === 1, "Hot-query migration was not recorded exactly once");

  for (const [version, filename] of [
    ["0024", "0024_icai_source_bootstrap.sql"],
    ["0025", "0025_icai_review_audit.sql"],
    ["0029", "0029_icai_bootstrap_window.sql"],
    ["0030", "0030_icai_phase1_current_sources.sql"],
  ]) {
    const journalRows = execute(`SELECT name FROM d1_migrations WHERE name='${filename}';`);
    assert(journalRows.length === 1, `${filename} Wrangler migration was not recorded exactly once`);
    const schemaRows = execute(`SELECT version FROM _ca_schema_migrations WHERE version='${version}';`);
    assert(schemaRows.length === 1, `Retained schema migration ${version} was not recorded exactly once`);
  }

  const auditTables = execute("SELECT name FROM sqlite_master WHERE type='table' AND name='icai_review_decisions';");
  assert(auditTables.length === 1, "ICAI review decision audit table is missing");
  const auditTriggers = execute("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'icai_review_%';").map((row) => row.name);
  for (const trigger of ["icai_review_queue_requires_audit","icai_review_queue_blocks_dismissal","icai_review_decisions_no_update","icai_review_decisions_no_delete"]) assert(auditTriggers.includes(trigger), `Missing ICAI review audit trigger ${trigger}`);

  const seededSources = execute(`SELECT id,official_url,adapter_key,level_codes,is_active,adapter_config FROM icai_sources WHERE id IN (${seededSourceIds.map((id) => `'${id}'`).join(",")}) AND is_active=1 ORDER BY id;`);
  assert(seededSources.length === 6, "ICAI Phase 1 bootstrap did not retain exactly six active current sources");

  const expectedSources = new Map([
    ["icai-final-course", ["https://www.icai.org/post/final-nset", "resource_hub", ["final"]]],
    ["icai-foundation-course", ["https://www.icai.org/post/foundation-nset", "resource_hub", ["foundation"]]],
    ["icai-intermediate-course", ["https://www.icai.org/post/intermediate-nset", "resource_hub", ["intermediate"]]],
    ["icai-exam-may-2026", ["https://www.icai.org/post/exam-may-2026", "anchor_feed", ["foundation","intermediate","final"]]],
    ["icai-exam-sep-nov-2026", ["https://www.icai.org/post/24137", "anchor_feed", ["foundation","intermediate","final"]]],
    ["icai-bos-important-announcements", ["https://www.icai.org/category/bos-important-announcements/1", "anchor_feed", ["foundation","intermediate","final"]]],
  ]);

  for (const source of seededSources) {
    const expected = expectedSources.get(String(source.id));
    assert(expected, `Unexpected seeded ICAI source ${source.id}`);
    assert(source.official_url === expected[0], `Unexpected URL for ${source.id}: ${source.official_url}`);
    assert(source.adapter_key === expected[1], `Unexpected adapter for ${source.id}`);
    assert(JSON.stringify(JSON.parse(String(source.level_codes))) === JSON.stringify(expected[2]), `Unexpected level scope for ${source.id}`);
    const config = JSON.parse(String(source.adapter_config));
    assert(config.bootstrap_profile === "phase1-current-window-v1", `Missing Phase 1 bootstrap profile for ${source.id}`);
    assert(config.bootstrap_attempt_floor === "2026-05", `Unexpected attempt floor for ${source.id}`);
    assert(config.bootstrap_published_floor === "2025-12-01", `Unexpected publication floor for ${source.id}`);
    assert(config.bootstrap_complete === false, `Phase 1 source ${source.id} must be pending its first successful bootstrap in a fresh DB`);
  }

  console.log("Retained D1 hot-query and current ICAI Phase 1 bootstrap validation PASS (journal-idempotent apply, intended plans, foreign keys, six current official sources, audited review enforcement).");
} finally {
  rmSync(persistTo, { recursive: true, force: true });
  rmSync(configPath, { force: true });
}
