import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 7 reuses Phase 8 ICAI metadata instead of duplicating official resources", () => {
  const service = read("lib/resources/service.ts");
  const migration = read("supabase/migrations/20260830140100_phase7_notes_resources.sql");
  assert.match(service, /getIcaiPublicCatalog/);
  assert.doesNotMatch(migration, /create table public\.official_resources/);
  assert.doesNotMatch(migration, /create table public\.icai_resources/);
});

test("Phase 7 keeps file bytes out of metadata tables", () => {
  const migration = read("supabase/migrations/20260830140100_phase7_notes_resources.sql");
  assert.match(migration, /storage_path text not null unique/);
  assert.match(migration, /mime_type text not null/);
  assert.match(migration, /size_bytes bigint not null/);
  assert.doesNotMatch(migration, /file_bytes|bytea/);
});
