import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("ICAI resources have a real parent-specific mapping path without weakening uploaded-resource foreign keys", () => {
  const base = read("d1/migrations/0001_phase2_platform.sql");
  const repair = read("d1/migrations/0032_icai_resource_mapping_integrity.sql");

  assert.match(base, /CREATE TABLE IF NOT EXISTS resource_attempt_map[\s\S]*REFERENCES uploaded_resources\(id\)/);
  assert.match(base, /CREATE TABLE IF NOT EXISTS resource_subject_map[\s\S]*REFERENCES uploaded_resources\(id\)/);

  assert.match(repair, /ALTER TABLE resource_attempt_map RENAME TO uploaded_resource_attempt_map/);
  assert.match(repair, /ALTER TABLE resource_subject_map RENAME TO uploaded_resource_subject_map/);
  assert.match(repair, /CREATE TABLE icai_resource_attempt_map[\s\S]*REFERENCES icai_resources\(id\) ON DELETE CASCADE/);
  assert.match(repair, /CREATE TABLE icai_resource_subject_map[\s\S]*REFERENCES icai_resources\(id\) ON DELETE CASCADE/);
  assert.match(repair, /CREATE VIEW resource_attempt_map AS[\s\S]*uploaded_resource_attempt_map[\s\S]*icai_resource_attempt_map/);
  assert.match(repair, /CREATE VIEW resource_subject_map AS[\s\S]*uploaded_resource_subject_map[\s\S]*icai_resource_subject_map/);
  assert.match(repair, /INSTEAD OF INSERT ON resource_attempt_map/);
  assert.match(repair, /INSTEAD OF DELETE ON resource_attempt_map/);
  assert.match(repair, /INSTEAD OF INSERT ON resource_subject_map/);
  assert.match(repair, /INSTEAD OF DELETE ON resource_subject_map/);
});

test("retained D1 deployment preserves migration 0032 integrity through Phase 3EF migration 0038", () => {
  const runner = read("scripts/apply-retained-d1-migrations.mjs");
  assert.match(runner, /\["0032", "d1\/migrations\/0032_icai_resource_mapping_integrity\.sql"\]/);
  assert.match(runner, /\["0033", "d1\/migrations\/0033_icai_phase2_incremental_watermarks\.sql"\]/);
  assert.match(runner, /\["0034", "d1\/migrations\/0034_icai_phase2a_source_stability\.sql"\]/);
  assert.match(runner, /\["0035", "d1\/migrations\/0035_icai_phase2b_source_cursor\.sql"\]/);
  assert.match(runner, /\["0036", "d1\/migrations\/0036_icai_phase2c_future_state\.sql"\]/);
  assert.match(runner, /\["0037", "d1\/migrations\/0037_icai_phase3b_operator_controls\.sql"\]/);
  assert.match(runner, /BETWEEN '0012' AND '0046'/);
  assert.match(runner, /PRAGMA foreign_key_check/);
});

test("ICAI writer and public catalog retain one logical map contract across the compatibility views", () => {
  const worker = read("workers/icai-sync/d1-client.ts");
  const query = read("lib/icai/query.ts");
  assert.match(worker, /resource_attempt_map/);
  assert.match(worker, /resource_subject_map/);
  assert.match(query, /from\("resource_attempt_map"\)/);
  assert.match(query, /from\("resource_subject_map"\)/);
});
