import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  assert.match(resolver, /MAX_RESOLUTION_MS = 105_000/);
  assert.match(resolver, /Math\.min\(source\.timeoutMs, MAX_CHILD_TIMEOUT_MS\)/);
  assert.match(resolver, /unavailableLandingPages \+= 1/);
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(engine, /direct\.unavailableLandingPages === 0/);
});

test("Phase 2 retained migration and clean-D1 validator cover migration 0033", () => {
  const retained = read("scripts/apply-retained-d1-migrations.mjs");
  const validator = read("scripts/validate-d1-hot-indexes.mjs");
  assert.match(retained, /\["0033", "d1\/migrations\/0033_icai_phase2_incremental_watermarks\.sql"\]/);
  assert.match(retained, /BETWEEN '0012' AND '0033'/);
  assert.match(validator, /0033_icai_phase2_incremental_watermarks\.sql/);
  assert.match(validator, /icai_source_watermarks/);
  assert.match(validator, /icai_source_watermark_after_success/);
});

test("Phase 2 deployment proves a second real Queue sync is idempotent", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
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
});
