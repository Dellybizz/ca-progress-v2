import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const wrangler = process.platform === "win32" ? "npx.cmd" : "npx";
const database = "ca-progress-v2-retirement-validation";
const persistTo = mkdtempSync(join(tmpdir(), "ca-progress-d1-indexes-"));
const configPath = join(process.cwd(), `.wrangler-d1-validation-${process.pid}.json`);
const base = ["wrangler", "--config", configPath];
const icaiBootstrapMigration = "d1/migrations/0024_icai_source_bootstrap.sql";
const icaiReviewAuditMigration = "d1/migrations/0025_icai_review_audit.sql";
const seededSourceIds = ["icai-final-course", "icai-foundation-course", "icai-intermediate-course"];

function run(args) {
  return execFileSync(wrangler, [...base, ...args], {
    cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "1", NO_D1_WARNING: "true" },
  });
}
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

  run(["d1", "migrations", "apply", database, "--local", "--persist-to", persistTo]);
  run(["d1", "migrations", "apply", database, "--local", "--persist-to", persistTo]);

  // Retained production D1 reapplies additive migrations directly. Reapply the ICAI
  // bootstrap and review audit migrations twice to prove they are safe outside Wrangler's journal too.
  run(["d1", "execute", database, "--local", "--persist-to", persistTo, "--file", icaiBootstrapMigration]);
  run(["d1", "execute", database, "--local", "--persist-to", persistTo, "--file", icaiBootstrapMigration]);
  run(["d1", "execute", database, "--local", "--persist-to", persistTo, "--file", icaiReviewAuditMigration]);
  run(["d1", "execute", database, "--local", "--persist-to", persistTo, "--file", icaiReviewAuditMigration]);

  const indexes = execute("SELECT name FROM sqlite_master WHERE type='index';").map((row) => row.name);
  for (const name of expectedIndexes) assert(indexes.includes(name), `Missing index ${name}`);

  for (const [label, sql, expected] of plans) {
    const details = execute(`EXPLAIN QUERY PLAN ${sql};`).map((row) => String(row.detail ?? row["3"] ?? ""));
    assert(details.some((detail) => detail.includes(expected)), `${label} plan did not use ${expected}: ${details.join(" | ")}`);
  }

  assert(execute("PRAGMA foreign_key_check;").length === 0, "D1 foreign-key check failed");
  const migrationRows = execute("SELECT name FROM d1_migrations WHERE name='0009_phase5_hot_query_indexes.sql';");
  assert(migrationRows.length === 1, "Hot-query migration was not recorded exactly once");

  const bootstrapJournalRows = execute("SELECT name FROM d1_migrations WHERE name='0024_icai_source_bootstrap.sql';");
  assert(bootstrapJournalRows.length === 1, "ICAI source bootstrap Wrangler migration was not recorded exactly once");
  const bootstrapSchemaRows = execute("SELECT version FROM _ca_schema_migrations WHERE version='0024';");
  assert(bootstrapSchemaRows.length === 1, "ICAI source bootstrap migration was not recorded exactly once");

  const reviewJournalRows = execute("SELECT name FROM d1_migrations WHERE name='0025_icai_review_audit.sql';");
  assert(reviewJournalRows.length === 1, "ICAI review audit Wrangler migration was not recorded exactly once");
  const reviewSchemaRows = execute("SELECT version FROM _ca_schema_migrations WHERE version='0025';");
  assert(reviewSchemaRows.length === 1, "ICAI review audit migration was not recorded exactly once");
  const auditTables = execute("SELECT name FROM sqlite_master WHERE type='table' AND name='icai_review_decisions';");
  assert(auditTables.length === 1, "ICAI review decision audit table is missing");
  const auditTriggers = execute("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'icai_review_%';").map((row) => row.name);
  for (const trigger of ["icai_review_queue_requires_audit","icai_review_queue_blocks_dismissal","icai_review_decisions_no_update","icai_review_decisions_no_delete"]) assert(auditTriggers.includes(trigger), `Missing ICAI review audit trigger ${trigger}`);

  const seededSources = execute(`SELECT id,official_url,adapter_key,level_codes,is_active FROM icai_sources WHERE id IN (${seededSourceIds.map((id) => `'${id}'`).join(",")}) AND is_active=1 ORDER BY id;`);
  assert(seededSources.length === 3, "ICAI source bootstrap did not retain exactly three seeded active sources");
  const expectedSources = new Map([
    ["icai-final-course", ["https://www.icai.org/category/final-course", "final"]],
    ["icai-foundation-course", ["https://www.icai.org/category/foundation-course", "foundation"]],
    ["icai-intermediate-course", ["https://www.icai.org/category/intermediate-course", "intermediate"]],
  ]);
  for (const source of seededSources) {
    const expected = expectedSources.get(String(source.id));
    assert(expected, `Unexpected seeded ICAI source ${source.id}`);
    assert(source.official_url === expected[0], `Unexpected URL for ${source.id}`);
    assert(source.adapter_key === "resource_hub", `Unexpected adapter for ${source.id}`);
    assert(JSON.stringify(JSON.parse(String(source.level_codes))) === JSON.stringify([expected[1]]), `Unexpected level scope for ${source.id}`);
  }

  console.log("Retained D1 hot-query and ICAI source/review validation PASS (idempotent apply, intended plans, foreign keys, official sources, audited review enforcement).");
} finally {
  rmSync(persistTo, { recursive: true, force: true });
  rmSync(configPath, { force: true });
}
