import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 2 persists a durable successful-only per-source watermark", () => {
  const migration = read("d1/migrations/0033_icai_phase2_incremental_watermarks.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS icai_source_watermarks/);
  assert.match(migration, /source_id TEXT PRIMARY KEY REFERENCES icai_sources\(id\) ON DELETE CASCADE/);
  assert.match(migration, /bootstrap_complete INTEGER NOT NULL/);
  assert.match(migration, /published_high_watermark TEXT/);
  assert.match(migration, /attempt_high_watermark TEXT/);
  assert.match(migration, /AFTER UPDATE OF last_success_at ON icai_sources/);
  assert.match(migration, /icai_source_watermark_after_success/);
  assert.match(migration, /VALUES \('0033'/);
});

test("Phase 2 uses the durable lock while preserving the Phase 1 compatibility flag", () => {
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(engine, /SELECT bootstrap_complete,bootstrap_completed_at,last_success_at,published_high_watermark,attempt_high_watermark FROM icai_source_watermarks/);
  assert.match(engine, /policySource/);
  assert.match(engine, /bootstrap_complete: true/);
  assert.match(engine, /completedAdapterConfig/);
});

test("Phase 2 resource identity survives a changed direct ICAI PDF URL", () => {
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(engine, /resourceSemanticKey/);
  assert.match(engine, /existingByUrl\.get\(item\.officialUrl\)/);
  assert.match(engine, /existingBySemantic\.get\(semanticKey\)/);
  assert.match(engine, /sha256Hex\(semanticKey\)/);
  assert.doesNotMatch(engine, /sha256Hex\(`\$\{source\.id\}:\$\{item\.officialUrl\}`\)/);
  assert.match(engine, /semantic_key: semanticKey/);
  assert.match(engine, /if \(!existingBySemantic\.has\(key\)\)/);
  assert.doesNotMatch(engine, /Ambiguous ICAI semantic resource identity/);
});

test("Phase 2 skips stale nested ICAI leaves without failing the complete source", () => {
  const resolver = read("workers/icai-sync/direct-resource-resolver.ts");
  assert.match(resolver, /response\.status === 404 \|\| response\.status === 410/);
  assert.match(resolver, /if \(html === null\) \{/);
  assert.match(resolver, /MAX_RESOLUTION_MS = 60_000/);
  assert.match(resolver, /Math\.min\(source\.timeoutMs, MAX_CHILD_TIMEOUT_MS\)/);
  assert.match(resolver, /unavailableLandingPages \+= 1/);
  assert.doesNotMatch(resolver, /throw new Error\(`Direct-PDF resolver exceeded/);
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(engine, /unavailableLandingPages === 0/);
  assert.match(engine, /unavailableLandingPages > 0/);
  assert.match(engine, /preserved_existing_resources/);
  assert.match(engine, /icai_sync_record_unchanged/);
});

test("Phase 2 retained migration remains covered through Phase 3EF migration 0038", () => {
  const retained = read("scripts/apply-retained-d1-migrations.mjs");
  const validator = read("scripts/validate-d1-hot-indexes.mjs");
  assert.match(retained, /\["0033", "d1\/migrations\/0033_icai_phase2_incremental_watermarks\.sql"\]/);
  assert.match(retained, /\["0034", "d1\/migrations\/0034_icai_phase2a_source_stability\.sql"\]/);
  assert.match(retained, /\["0035", "d1\/migrations\/0035_icai_phase2b_source_cursor\.sql"\]/);
  assert.match(retained, /\["0036", "d1\/migrations\/0036_icai_phase2c_future_state\.sql"\]/);
  assert.match(retained, /\["0037", "d1\/migrations\/0037_icai_phase3b_operator_controls\.sql"\]/);
  assert.match(retained, /\["0038", "d1\/migrations\/0038_icai_phase3ef_item_isolation\.sql"\]/);
  assert.match(retained, /BETWEEN '0012' AND '0046'/);
  assert.match(validator, /0033_icai_phase2_incremental_watermarks\.sql/);
  assert.match(validator, /icai_source_watermarks/);
  assert.match(validator, /icai_source_watermark_after_success/);
  assert.match(validator, /0034_icai_phase2a_source_stability\.sql/);
  assert.match(validator, /icai_sync_item_skips/);
  assert.match(validator, /icai_sync_item_failures/);
  assert.match(validator, /0035_icai_phase2b_source_cursor\.sql/);
  assert.match(validator, /cursor_offset/);
  assert.match(validator, /0036_icai_phase2c_future_state\.sql/);
  assert.match(validator, /last_listing_hash/);
});

test("Phase 2C makes bootstrap time immutable and advances listing state only with source success", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE _ca_schema_migrations(version TEXT PRIMARY KEY,description TEXT,source_freeze_commit TEXT);
    CREATE TABLE icai_sources(id TEXT PRIMARY KEY,last_success_at TEXT,last_content_hash TEXT);
    CREATE TABLE icai_source_watermarks(
      source_id TEXT PRIMARY KEY REFERENCES icai_sources(id),bootstrap_complete INTEGER NOT NULL DEFAULT 0,
      bootstrap_completed_at TEXT,last_success_at TEXT,published_high_watermark TEXT,attempt_high_watermark TEXT,
      last_content_hash TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO icai_sources(id) VALUES('source-a');
    INSERT INTO icai_source_watermarks(source_id,bootstrap_complete,bootstrap_completed_at)
      VALUES('source-a',1,'2026-09-01T00:00:00.000Z');
  `);
  db.exec(read("d1/migrations/0036_icai_phase2c_future_state.sql"));
  assert.throws(() => db.exec("UPDATE icai_source_watermarks SET bootstrap_completed_at='2026-09-02T00:00:00.000Z' WHERE source_id='source-a'"), /immutable/);
  db.exec("UPDATE icai_sources SET last_success_at='2026-09-03T00:00:00.000Z',last_content_hash='content-1',last_listing_hash='listing-1' WHERE id='source-a'");
  const watermark = db.prepare("SELECT bootstrap_completed_at,last_listing_hash FROM icai_source_watermarks WHERE source_id='source-a'").get();
  assert.equal(watermark.bootstrap_completed_at, "2026-09-01T00:00:00.000Z");
  assert.equal(watermark.last_listing_hash, "listing-1");
  db.close();
});

test("Phase 2C preserves semantic IDs, collapses only explicit duplicates, and orders review evidence", () => {
  const engine = read("workers/icai-sync/sync-engine.ts");
  const client = read("workers/icai-sync/d1-client.ts");
  assert.match(engine, /existingByUrl\.set\(row\.official_url, canonicalId\)/);
  assert.match(engine, /legacyDuplicateReplacements/);
  assert.match(engine, /p_resource_duplicates/);
  assert.match(client, /changeType:"duplicate_collapsed"/);
  assert.match(client, /Identical pending review already exists/);
  assert.match(client, /nextEvidence\.fetched_at<=previousEvidence/);
  assert.match(client, /A pending review already has equal or newer official evidence/);
  assert.match(client, /await db\.prepare\("UPDATE icai_sync_runs[\s\S]*await sourceSuccess/);
});

test("Phase 2B resumes a source from a bounded durable cursor", () => {
  const migration = read("d1/migrations/0035_icai_phase2b_source_cursor.sql");
  const engine = read("workers/icai-sync/sync-engine.ts");
  const jobs = read("lib/jobs/execute.ts");
  const status = read("lib/icai/status-query.ts");
  const monitor = read("components/icai/sync-live-refresh.tsx");

  assert.match(migration, /cursor_offset INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /listing_hash TEXT/);
  assert.match(migration, /partial_resources TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(migration, /continuation_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(engine, /discovered\.resources\.slice\(cursorOffset, chunkEnd\)/);
  assert.match(engine, /cursorOffset \+ 4/);
  assert.match(engine, /MAX_SOURCE_CONTINUATIONS = 50/);
  assert.match(engine, /MAX_PARTIAL_PAYLOAD_BYTES = 1_500_000/);
  assert.match(engine, /status: "continuing"/);
  assert.match(jobs, /result\.status === "continuing"/);
  assert.match(jobs, /:cursor:\$\{cursor\}/);
  assert.match(status, /cursor_offset,cursor_total,continuation_count/);
  assert.match(monitor, /source items/);
});

test("Phase 2A isolates broken nested files and records bounded operator-visible evidence", () => {
  const migration = read("d1/migrations/0034_icai_phase2a_source_stability.sql");
  const resolver = read("workers/icai-sync/direct-resource-resolver.ts");
  const engine = read("workers/icai-sync/sync-engine.ts");
  const actions = read("app/(admin)/admin/icai-sync/actions.ts");
  const monitor = read("components/icai/sync-live-refresh.tsx");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS icai_sync_item_skips/);
  assert.match(migration, /scope TEXT NOT NULL CHECK\(scope IN \('temporary','permanent'\)\)/);
  assert.match(migration, /UNIQUE\(source_id,item_url\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS icai_sync_item_failures/);
  assert.match(resolver, /MAX_RECORDED_ITEM_FAILURES = 25/);
  assert.match(resolver, /kind: "not_found"/);
  assert.match(resolver, /kind: timedOut \? "timeout" : "fetch_error"/);
  assert.match(resolver, /failureCategory: timedOut \? "timeout" : "fetch_error"/);
  assert.match(resolver, /kind: "parse_error"/);
  assert.match(resolver, /kind: "source_budget"/);
  assert.match(resolver, /kind: "page_limit"/);
  assert.match(engine, /FROM icai_sync_item_skips/);
  assert.match(engine, /INSERT INTO icai_sync_item_failures/);
  assert.match(engine, /incomplete_nested_traversal: true/);
  assert.match(engine, /preserved_existing_resources/);
  assert.match(actions, /export async function skipIcaiItemAction/);
  assert.match(actions, /runtime\.data\.current_source_id !== sourceId/);
  assert.match(actions, /24 \* 60 \* 60 \* 1000/);
  assert.match(monitor, /Skip on future runs for 24h/);
  assert.match(monitor, /Skip on all future runs/);
});

test("Phase 2 deployment proves a second real Queue sync is idempotent", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
  const isolatedWorkflow = read(".github/workflows/icai-live-verification.yml");
  const verifier = read("scripts/verify-icai-phase2-live.mjs");
  assert.match(workflow, /ICAI Phase 2 incremental idempotency proof/);
  assert.match(workflow, /verify-icai-phase2-live\.mjs/);
  assert.match(verifier, /icai-phase5-real-run\.json/);
  assert.match(verifier, /baseline-recovery/);
  assert.match(verifier, /two \*complete\* runs/);
  assert.match(verifier, /\["success", "partial"\]\.includes\(run\.status\)/);
  assert.match(verifier, /Phase 2 repeat sync was not idempotent/);
  assert.match(verifier, /repeatRun\.new_items/);
  assert.match(verifier, /bootstrap_completed_at !== before\.bootstrap_completed_at/);
  assert.match(verifier, /PRAGMA foreign_key_check/);
  assert.match(verifier, /icai-phase2d-before\.json/);
  assert.match(verifier, /resourceDigest/);
  assert.match(verifier, /duplicateReviews/);
  assert.match(verifier, /reviewDigest/);
  assert.match(verifier, /last_listing_hash/);
  assert.match(workflow, /verify-icai-surfaces-live\.mjs/);
  assert.match(isolatedWorkflow, /ICAI Phase 2D Production Certification/);
  assert.match(isolatedWorkflow, /cf:migrate:retained/);
  assert.match(isolatedWorkflow, /verify-icai-phase2-live\.mjs/);
  assert.match(isolatedWorkflow, /verify-icai-surfaces-live\.mjs/);
});
