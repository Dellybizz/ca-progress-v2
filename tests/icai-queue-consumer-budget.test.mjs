import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const jsonc = (path) => JSON.parse(read(path));

test("ICAI queue execution has enough CPU budget on both caller and private service", () => {
  const web = jsonc("wrangler.jsonc");
  const icai = jsonc("workers/icai-sync/wrangler.jsonc");
  assert.equal(web.limits?.cpu_ms, 300000, "the web Worker owns the Queue consumer and must opt into the 5-minute CPU budget");
  assert.equal(icai.limits?.cpu_ms, 300000, "the private ICAI service must have the same heavy-job CPU budget");
  assert.ok(web.queues?.consumers?.some((consumer) => consumer.queue === "ca-progress-v2-phase3-background"), "web Worker must remain the configured Queue consumer");
  assert.equal(icai.workers_dev, false, "ICAI service must remain private");
});

test("background jobs are isolated from concurrent D1 writes inside queue batches", () => {
  const web = jsonc("wrangler.jsonc");
  const worker = read("custom-worker.ts");
  const consumer = web.queues?.consumers?.find((item) => item.queue === "ca-progress-v2-phase3-background");
  assert.equal(consumer?.max_batch_size, 1);
  assert.equal(consumer?.max_concurrency, 1);
  assert.match(worker, /for \(const message of batch\.messages\) await runQueuedJob\(message, env\)/);
  assert.doesNotMatch(worker, /Promise\.all\(batch\.messages\.map/);
});

test("official ICAI source discovery gets a dedicated service-binding wall-time budget", () => {
  const worker = read("custom-worker.ts");
  assert.match(worker, /const ICAI_SERVICE_TIMEOUT_MS = 20_000/);
  assert.match(worker, /const ICAI_SOURCE_TIMEOUT_MS = 150_000/);
  assert.match(worker, /path === "\/source" \? ICAI_SOURCE_TIMEOUT_MS : ICAI_SERVICE_TIMEOUT_MS/);
});

test("live ICAI proof waits beyond the configured 5-minute CPU ceiling without masking dead letters", () => {
  const proof = read("scripts/verify-icai-phase5-live.mjs");
  assert.match(proof, /const JOB_POLL_INTERVAL_MS = 5_000/);
  assert.match(proof, /const JOB_POLL_ATTEMPTS = 90/);
  assert.match(proof, /status === "dead_letter"/);
  assert.match(proof, /await sleep\(JOB_POLL_INTERVAL_MS\)/);
  assert.ok(90 * 5_000 > 300_000, "live proof must allow more wall time than the configured CPU ceiling");
  assert.ok(90 * 5_000 < 15 * 60_000, "live proof must remain below Cloudflare Queue's 15-minute wall-time ceiling");
});

test("live ICAI proof binds continuation evidence to its exact deployment correlation and SHA", () => {
  const proof = read("scripts/verify-icai-phase5-live.mjs");
  assert.match(proof, /json_extract\(payload_json,'\$\.phase5Correlation'\)=\$\{sqlText\(correlationId\)\}/);
  assert.match(proof, /json_extract\(payload_json,'\$\.gitSha'\)=\$\{sqlText\(sha\)\}/);
  assert.match(proof, /json_extract\(payload_json,'\$\.runId'\) AS run_id/);
  assert.match(proof, /WHERE id=\$\{sqlText\(matchingRunId\)\}/);
  assert.doesNotMatch(proof, /FROM icai_sync_runs WHERE trigger_type='manual'.*ORDER BY started_at DESC LIMIT 1/);
});
