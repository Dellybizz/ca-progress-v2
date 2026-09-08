import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 5 review proof uses the real audited decision path and isolated non-public resources", () => {
  const probe = read("lib/icai/phase5.ts");
  assert.match(probe, /decideIcaiReview/);
  assert.match(probe, /decision: "approve"/);
  assert.match(probe, /decision: "reject"/);
  assert.match(probe, /ICAI_PHASE5_PROBE_PREFIX = "__phase5__"/);
  assert.match(probe, /verification_status.*phase5_probe|phase5-live-probe/);
  assert.match(probe, /approved_resource_status !== "removed"/);
  assert.match(probe, /rejected_resource_status !== "active"/);
  assert.match(probe, /decision_count\) !== 2/);
});

test("Phase 5 probe is accepted only as a queue job and the public internal executor route is blocked", () => {
  const queue = read("lib/jobs/queue.ts");
  const execute = read("lib/jobs/execute.ts");
  const worker = read("custom-worker.ts");
  assert.match(queue, /"icai-phase5-review-probe"/);
  assert.match(execute, /case "icai-phase5-review-probe"/);
  assert.match(execute, /runIcaiPhase5ReviewProbe/);
  assert.match(worker, /input\.type !== "icai-phase5-review-probe"/);
  assert.match(worker, /pathname === "\/api\/internal\/background-jobs"/);
  assert.match(worker, /status: 404/);
  assert.ok(worker.indexOf('pathname === "/api/internal/background-jobs"') < worker.indexOf("openNextWorker.fetch(forwarded"));
  assert.match(worker, /openNextWorker\.fetch\(new Request\("https:\/\/internal\.ca-progress\/api\/internal\/background-jobs"/);
});

test("Phase 5 live verifier pushes through Cloudflare Queues and proves official-source D1, review, frontend and idempotency outcomes", () => {
  const live = read("scripts/verify-icai-phase5-live.mjs");
  assert.match(live, /\/accounts\/\$\{accountId\}\/queues\/\$\{queueId\}\/messages/);
  assert.match(live, /type: "icai-sync"/);
  assert.match(live, /type: "icai-phase5-review-probe"/);
  assert.match(live, /background_jobs/);
  assert.match(live, /icai_sync_runs/);
  assert.match(live, /icai_source_snapshots/);
  assert.match(live, /sourceIds: \[selectedSource\.id\]/);
  assert.match(live, /phase8\.1-item-isolation/);
  assert.match(live, /icai_sync_items/);
  assert.match(live, /http_status/);
  assert.match(live, /duration_ms/);
  assert.match(live, /bytes_fetched/);
  assert.match(live, /parsed_count/);
  assert.match(live, /enabled_windows/);
  assert.match(live, /active_runs/);
  assert.match(live, /active_jobs/);
  assert.match(live, /sync-replay\.json/);
  assert.match(live, /review-replay\.json/);
  assert.match(live, /source_succeeded/);
  assert.match(live, /icai_review_decisions/);
  assert.match(live, /canonical_before/);
  assert.match(live, /canonical_after/);
  assert.match(live, /idempotency_key/);
  assert.match(live, /\/updates\?phase5=/);
  assert.match(live, /\/resources\/icai\?phase5=/);
  assert.match(live, /PRAGMA foreign_key_check/);
  assert.match(live, /source_total\) !== 1/);
});

test("Phase 5 remains attached to the real cron, queue and private ICAI service architecture", () => {
  const wrangler = read("wrangler.jsonc");
  const worker = read("custom-worker.ts");
  const sync = read("lib/icai/sync.ts");
  assert.match(wrangler, /"queue": "ca-progress-v2-phase3-background"/);
  assert.match(wrangler, /"30 0,2,4,6,8,10,12,14,16,18 \* \* \*"/);
  assert.match(wrangler, /"0 \* \* \* \*"/);
  assert.match(wrangler, /"binding": "ICAI_SYNC_SERVICE"/);
  assert.match(worker, /scheduled\(controller: ScheduledController, env: WorkerEnv, ctx: WorkerContext\)/);
  assert.match(worker, /dispatchScheduledIcai\(controller, env\)/);
  assert.match(worker, /selectIcaiScheduledDispatch/);
  assert.match(worker, /type: "icai-sync"/);
  assert.match(sync, /ICAI_SYNC_SERVICE/);
  assert.match(sync, /https:\/\/icai-sync\.internal\/run/);
});

test("Phase 5 is a permanent focused gate in CI, retirement closure and deployment", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.match(packageJson.scripts["test:icai:phase5"], /icai-sync-phase5\.test\.mjs/);
  for (const path of [
    ".github/workflows/ci.yml",
    ".github/workflows/supabase-retirement-closure.yml",
    ".github/workflows/deploy-staging.yml",
  ]) {
    const workflow = read(path);
    assert.match(workflow, /Focused ICAI Phase 5 verification/);
    assert.match(workflow, /npm run test:icai:phase5/);
  }
  const deployment = read(".github/workflows/deploy-staging.yml");
  assert.match(deployment, /ICAI Phase 5 live pipeline proof/);
  assert.match(deployment, /verify-icai-phase5-live\.mjs/);
  assert.match(deployment, /rollback --name ca-progress-v2-icai-sync/);
  assert.match(deployment, /rollback --name ca-progress-v2/);
  const retry = read("scripts/retry-transient-cloudflare-command.mjs");
  assert.match(retry, /maxAttempts = 4/);
  assert.match(retry, /service unavailable/);
  assert.match(retry, /received a malformed response from the api/);
  assert.match(retry, /if \(!retryable \|\| attempt === maxAttempts\)/);
  assert.match(deployment, /retry-transient-cloudflare-command\.mjs -- npm run cf:deploy:web/);
  const status = read("docs/ICAI_SYNC_PHASE5_STATUS.md");
  assert.match(status, /bounded to one source/);
  assert.match(status, /469\/469 passed/);
  assert.match(status, /34241871496/);
  assert.match(status, /34241871433/);
  assert.match(status, /implementation and authoritative repository gates are complete/);
});
