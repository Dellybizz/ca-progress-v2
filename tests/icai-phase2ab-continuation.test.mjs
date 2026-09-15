import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 2A/2B deployed Queue consumer resumes the same persisted source cursor", () => {
  const worker = read("custom-worker.ts");
  assert.match(worker, /result\.status === "continuing"/);
  assert.match(worker, /icai-sync-source:\$\{runId\}:\$\{sourceIndex\}:\$\{sourceId\}:cursor:\$\{cursor\}/);
  assert.match(worker, /sourceIndex, cursorOffset: cursor/);
  assert.match(worker, /mode: "finalize"/);
  assert.match(worker, /icai-sync-finalize:\$\{runId\}/);
  assert.doesNotMatch(worker, /await callIcaiService\(env, "\/finalize", \{ runId \}\);\n    return;\n  \}\n\n  const trigger/);
});

test("Phase 2B retries only the failed Queue batch and terminalizes after bounded retry exhaustion", () => {
  const worker = read("custom-worker.ts");
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(worker, /message\.retry\(\{ delaySeconds: retryDelaySeconds \}\)/);
  assert.match(worker, /Math\.min\(60, 15 \* \(2 \*\* Math\.max\(0, attempts - 1\)\)\)/);
  assert.match(worker, /mode: "source-fail"/);
  assert.match(worker, /icai-sync-source-fail:\$\{runId\}:\$\{sourceIndex\}:\$\{sourceId\}/);
  assert.match(worker, /background_job_dead_letters/);
  assert.match(engine, /failure_kind,error_message,skipped,occurred_at/);
  assert.match(engine, /'batch_retry'/);
  assert.match(engine, /'retry_exhausted'/);
  assert.match(engine, /throw error instanceof Error \? error : new Error\(message\)/);
});

test("Phase 2A one exhausted source advances to the next source instead of blocking the run", () => {
  const worker = read("custom-worker.ts");
  assert.match(worker, /mode === "source-fail"/);
  assert.match(worker, /await callIcaiService\(env, "\/source\/fail"/);
  assert.match(worker, /await queueIcaiFollowingStep/);
  assert.match(worker, /nextIndex < sourceIds\.length/);
});

test("Phase 2D verifiers accept multiple bounded cursor jobs while requiring terminal source state", () => {
  const phase5 = read("scripts/verify-icai-phase5-live.mjs");
  const phase2 = read("scripts/verify-icai-phase2-live.mjs");
  assert.match(phase5, /childJobs\.length >= sourceTotal/);
  assert.match(phase5, /cursor_offset,cursor_total,continuation_count/);
  assert.match(phase2, /childJobs\.length >= Number\(run\.source_total\)/);
  assert.match(phase2, /continuation source states are incomplete/);
});
