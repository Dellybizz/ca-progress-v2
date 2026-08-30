import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const migrationPath = join(root, "supabase/migrations/20260830080100_phase8_icai_sync_engine.sql");
const hardeningPath = join(root, "supabase/migrations/20260830080200_phase8_security_hardening.sql");
const migration = readFileSync(migrationPath, "utf8");
const hardening = readFileSync(hardeningPath, "utf8");

test("Phase 8 migrations exist and normalize the official-source engine", () => {
  assert.equal(existsSync(migrationPath), true);
  assert.equal(existsSync(hardeningPath), true);
  for (const table of ["icai_sources", "icai_sync_runs", "icai_source_snapshots", "icai_resources", "exam_attempts", "exam_events", "resource_attempt_map", "resource_subject_map", "icai_change_events", "icai_review_queue"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}\\b`, "i"));
  }
});

test("Phase 8 schema preserves provenance and duplicate identity", () => {
  assert.match(migration, /official_url text not null/i);
  assert.match(migration, /source_snapshot_id uuid references public\.icai_source_snapshots/i);
  assert.match(migration, /content_hash text not null/i);
  assert.match(migration, /parser_version text not null/i);
  assert.match(migration, /first_seen_at timestamptz/i);
  assert.match(migration, /last_seen_at timestamptz/i);
  assert.match(migration, /last_changed_at timestamptz/i);
  assert.match(migration, /unique \(source_id, official_url\)/i);
});

test("Phase 8 public data is RLS read-only while operational data remains private", () => {
  for (const table of ["icai_sources", "icai_sync_runs", "icai_source_snapshots", "exam_attempts", "exam_events", "icai_resources", "resource_attempt_map", "resource_subject_map", "icai_change_events", "icai_review_queue"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /exam_attempts_read_verified/i);
  assert.match(migration, /icai_resources_read_verified/i);
  assert.match(migration, /revoke all on public\.icai_sync_runs/i);
  assert.match(hardening, /revoke all on function public\.icai_sync_apply_source_batch[\s\S]*from public, anon, authenticated/i);
  assert.match(hardening, /grant execute on function public\.icai_review_decide[\s\S]*to service_role/i);
});

test("Phase 8 database supports auditable review-gated date changes and historical removal", () => {
  assert.match(migration, /High-impact exam attempt dates changed/i);
  assert.match(migration, /High-impact exam date or time changed/i);
  assert.match(migration, /decision_status.*pending_review/is);
  assert.match(migration, /status\s*=\s*'removed'/i);
  assert.doesNotMatch(migration, /delete from public\.icai_resources\s+where source_id/i);
});
