import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for ICAI Phase 5 live verification.`);
  return value;
};

const accountId = required("CLOUDFLARE_ACCOUNT_ID");
const token = required("CLOUDFLARE_API_TOKEN");
const baseUrl = required("DEPLOY_BASE_URL").replace(/\/$/, "");
const sha = required("GITHUB_SHA");
const runId = required("GITHUB_RUN_ID");
const runAttempt = process.env.GITHUB_RUN_ATTEMPT || "1";
const correlationId = `${sha.slice(0, 12)}-${runId}-${runAttempt}`.replace(/[^A-Za-z0-9._-]/g, "-");
const queueName = "ca-progress-v2-phase3-background";
const databaseName = "ca-progress-v2-phase4-shadow";
const parserVersion = "phase8.1-item-isolation";
const evidenceDir = "deployment-evidence";
mkdirSync(evidenceDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;

function d1(sql) {
  const stdout = execFileSync("npx", ["wrangler", "d1", "execute", databaseName, "--remote", "--config=wrangler.jsonc", "--json", "--command", sql], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  const payload = JSON.parse(stdout || "[]");
  return payload?.[0]?.results ?? [];
}

async function cloudflare(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { success: false, errors: [{ message: text.slice(0, 1000) }] }; }
  if (!response.ok || payload.success !== true) throw new Error(`Cloudflare API ${path} failed: ${JSON.stringify(payload.errors ?? payload).slice(0, 1500)}`);
  return payload;
}

async function publish(queueId, job, filename) {
  const payload = await cloudflare(`/accounts/${accountId}/queues/${queueId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body: job }),
  });
  writeFileSync(`${evidenceDir}/${filename}`, JSON.stringify(payload, null, 2));
}

async function waitForJobs(keys) {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    const rows = d1(`SELECT idempotency_key,status,attempts,last_error,started_at,finished_at FROM background_jobs WHERE idempotency_key IN (${keys.map(sqlText).join(",")}) ORDER BY idempotency_key;`);
    writeFileSync(`${evidenceDir}/icai-phase5-background-jobs.json`, JSON.stringify(rows, null, 2));
    const terminalFailure = rows.find((row) => row.status === "dead_letter");
    if (terminalFailure) throw new Error(`Phase 5 queue job dead-lettered: ${terminalFailure.idempotency_key}: ${terminalFailure.last_error ?? "unknown error"}`);
    if (rows.length === keys.length && rows.every((row) => row.status === "succeeded")) return rows;
    await sleep(5_000);
  }
  throw new Error("Phase 5 queue jobs did not both reach succeeded state.");
}

const internalAttempt = await fetch(`${baseUrl}/api/internal/background-jobs`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-ca-progress-internal": "ca-progress-v2-background-job" },
  body: JSON.stringify({ type: "icai-sync" }),
  redirect: "manual",
});
if (internalAttempt.status !== 404) throw new Error(`Public internal background-job route must return 404, received ${internalAttempt.status}.`);
writeFileSync(`${evidenceDir}/icai-phase5-internal-boundary.json`, JSON.stringify({ status: internalAttempt.status }, null, 2));

const queueList = await cloudflare(`/accounts/${accountId}/queues`);
const queue = (queueList.result ?? []).find((item) => item.queue_name === queueName);
if (!queue?.queue_id) throw new Error(`Cloudflare Queue ${queueName} was not found.`);
writeFileSync(`${evidenceDir}/icai-phase5-queue.json`, JSON.stringify({ queue_id: queue.queue_id, queue_name: queue.queue_name }, null, 2));

const startedAt = new Date(Date.now() - 5_000).toISOString();
const sourceRows = d1(`SELECT s.id,s.name,COALESCE(ss.priority,100) AS priority
  FROM icai_sources s
  LEFT JOIN icai_source_schedule ss ON ss.source_id=s.id
  WHERE s.is_active=1
    AND NOT EXISTS (
      SELECT 1 FROM icai_source_controls c
      WHERE c.source_id=s.id AND c.paused_until>CURRENT_TIMESTAMP
    )
  ORDER BY COALESCE(ss.priority,100),s.id LIMIT 1;`);
const selectedSource = sourceRows[0];
if (!selectedSource?.id) throw new Error("Phase 5 could not select one active ICAI source for the bounded live proof.");
writeFileSync(`${evidenceDir}/icai-phase5-selected-source.json`, JSON.stringify(selectedSource, null, 2));
const syncKey = `icai-phase5-sync:${correlationId}`;
const reviewKey = `icai-phase5-review:${correlationId}`;
const syncJob = {
  id: `phase5-sync-${correlationId}`,
  type: "icai-sync",
  idempotencyKey: syncKey,
  payload: {
    trigger: "manual",
    requestedBy: null,
    sourceIds: [selectedSource.id],
    syncGroup: "phase5-live-proof",
    scheduleWindow: "deployment",
    phase5Correlation: correlationId,
    gitSha: sha,
  },
  createdBy: null,
};
const reviewJob = {
  id: `phase5-review-${correlationId}`,
  type: "icai-phase5-review-probe",
  idempotencyKey: reviewKey,
  payload: { correlationId, gitSha: sha },
  createdBy: null,
};
await publish(queue.queue_id, syncJob, "icai-phase5-sync-push.json");
await publish(queue.queue_id, reviewJob, "icai-phase5-review-push.json");

await waitForJobs([reviewKey, syncKey]);

// Replay both queue messages with the same idempotency keys. The consumer must
// acknowledge them without creating or executing duplicate durable jobs.
await publish(queue.queue_id, syncJob, "icai-phase5-sync-replay.json");
await publish(queue.queue_id, reviewJob, "icai-phase5-review-replay.json");
await waitForJobs([reviewKey, syncKey]);

const realRuns = d1(`SELECT id,status,trigger_type,parser_version,started_at,completed_at,source_total,source_processed,source_succeeded,source_failed,new_items,changed_items,unchanged_items,removed_items,pending_reviews,error_summary,details FROM icai_sync_runs WHERE trigger_type='manual' AND parser_version=${sqlText(parserVersion)} AND started_at >= ${sqlText(startedAt)} ORDER BY started_at DESC LIMIT 1;`);
const realRun = realRuns[0];
if (!realRun) throw new Error("Phase 5 could not find the queue-triggered ICAI sync run in D1.");
if (!["success", "partial"].includes(realRun.status) || Number(realRun.source_succeeded) < 1 || Number(realRun.source_total) !== 1 || Number(realRun.source_processed) !== 1) {
  throw new Error(`Phase 5 real ICAI sync did not verify an official source: status=${realRun.status}, succeeded=${realRun.source_succeeded}, failed=${realRun.source_failed}.`);
}
const runDetails = JSON.parse(realRun.details || "{}");
if (!Array.isArray(runDetails.source_ids) || runDetails.source_ids.length !== 1 || runDetails.source_ids[0] !== selectedSource.id) {
  throw new Error("Phase 5 bounded live proof did not remain scoped to the selected source.");
}
writeFileSync(`${evidenceDir}/icai-phase5-real-run.json`, JSON.stringify(realRun, null, 2));

const snapshots = d1(`SELECT ss.id,ss.source_id,ss.fetched_at,ss.http_status,ss.canonical_hash,ss.parsed_item_count,s.official_url FROM icai_source_snapshots ss JOIN icai_sources s ON s.id=ss.source_id WHERE ss.run_id=${sqlText(realRun.id)} ORDER BY ss.source_id;`);
if (!snapshots.length || !snapshots.some((row) => Number(row.http_status) === 200 || Number(row.http_status) === 304)) {
  throw new Error("Phase 5 real sync produced no successful official-source snapshot.");
}
if (snapshots.some((row) => !/^https?:\/\/([a-z0-9-]+\.)*icai\.org(?:\/|$)/i.test(String(row.official_url)))) {
  throw new Error("Phase 5 snapshot evidence includes a non-ICAI source URL.");
}
writeFileSync(`${evidenceDir}/icai-phase5-source-snapshots.json`, JSON.stringify(snapshots, null, 2));

const itemRows = d1(`SELECT id,source_id,item_url,status,stage,attempts,http_status,duration_ms,bytes_fetched,parsed_count,failure_category,failure_message,skip_reason,retry_eligible FROM icai_sync_items WHERE run_id=${sqlText(realRun.id)} ORDER BY source_id,item_url;`);
if (!itemRows.length) throw new Error("Phase 5 real sync produced no per-item execution evidence.");
if (itemRows.some((row) => !["succeeded","failed","timed_out","skipped"].includes(row.status))) {
  throw new Error("Phase 5 found a non-terminal item after the sync run completed.");
}
const successfulItems = itemRows.filter((row) => row.status === "succeeded");
if (!successfulItems.length) throw new Error("Phase 5 real sync produced no successful item evidence.");
if (successfulItems.some((row) => Number(row.http_status) < 200 || Number(row.http_status) >= 400 || row.duration_ms === null || Number(row.bytes_fetched) < 0 || (row.stage !== "unchanged" && Number(row.parsed_count) < 1))) {
  throw new Error("Phase 5 item diagnostics are incomplete or inconsistent.");
}
writeFileSync(`${evidenceDir}/icai-phase5-item-results.json`, JSON.stringify(itemRows, null, 2));

const schedulerRows = d1(`SELECT
  (SELECT COUNT(*) FROM icai_sync_schedule_windows WHERE enabled=1) AS enabled_windows,
  (SELECT COUNT(*) FROM icai_source_schedule WHERE enabled=1) AS enabled_sources,
  (SELECT COUNT(*) FROM icai_sync_runs WHERE status IN ('queued','running')) AS active_runs,
  (SELECT COUNT(*) FROM background_jobs WHERE status IN ('queued','running') AND job_type='icai-sync') AS active_jobs;`);
const scheduler = schedulerRows[0];
if (!scheduler || Number(scheduler.enabled_windows) !== 10 || Number(scheduler.enabled_sources) < 1 || Number(scheduler.active_runs) !== 0 || Number(scheduler.active_jobs) !== 0) {
  throw new Error(`Phase 5 scheduler did not return to a healthy idle state: ${JSON.stringify(scheduler ?? {})}`);
}
writeFileSync(`${evidenceDir}/icai-phase5-scheduler-health.json`, JSON.stringify(scheduler, null, 2));

const approveReviewId = `__phase5__approve_review_${correlationId}`;
const rejectReviewId = `__phase5__reject_review_${correlationId}`;
const reviewRows = d1(`SELECT q.id,q.status AS review_status,r.status AS resource_status,d.decision,d.canonical_before,d.canonical_after,d.decided_at FROM icai_review_queue q JOIN icai_resources r ON r.id=q.entity_id JOIN icai_review_decisions d ON d.review_id=q.id WHERE q.id IN (${sqlText(approveReviewId)},${sqlText(rejectReviewId)}) ORDER BY q.id;`);
if (reviewRows.length !== 2) throw new Error(`Phase 5 expected two audited review outcomes, found ${reviewRows.length}.`);
const approved = reviewRows.find((row) => row.id === approveReviewId);
const rejected = reviewRows.find((row) => row.id === rejectReviewId);
if (!approved || approved.review_status !== "approved" || approved.resource_status !== "removed" || approved.decision !== "approved") {
  throw new Error("Phase 5 approval did not apply the reviewed canonical removal atomically.");
}
if (!rejected || rejected.review_status !== "rejected" || rejected.resource_status !== "active" || rejected.decision !== "rejected") {
  throw new Error("Phase 5 rejection changed canonical data or failed to persist its audit decision.");
}
const approvedBefore = JSON.parse(approved.canonical_before);
const approvedAfter = JSON.parse(approved.canonical_after);
const rejectedBefore = JSON.parse(rejected.canonical_before);
const rejectedAfter = JSON.parse(rejected.canonical_after);
if (approvedBefore.status !== "active" || approvedAfter.status !== "removed") throw new Error("Phase 5 approval audit before/after snapshots are inconsistent.");
if (JSON.stringify(rejectedBefore) !== JSON.stringify(rejectedAfter)) throw new Error("Phase 5 rejection audit shows a canonical mutation.");
writeFileSync(`${evidenceDir}/icai-phase5-review-outcomes.json`, JSON.stringify(reviewRows, null, 2));

const duplicates = d1(`SELECT idempotency_key,COUNT(*) AS row_count FROM background_jobs WHERE idempotency_key IN (${sqlText(syncKey)},${sqlText(reviewKey)}) GROUP BY idempotency_key HAVING COUNT(*)<>1;`);
if (duplicates.length) throw new Error("Phase 5 detected duplicate queue persistence for an idempotency key.");

const visibleRows = d1("SELECT title FROM icai_resources WHERE verification_status='verified' AND status='active' AND COALESCE(json_extract(metadata,'$.phase5_probe'),0)<>1 ORDER BY last_seen_at DESC LIMIT 1;");
const visibleTitle = visibleRows[0]?.title;
if (!visibleTitle) throw new Error("Phase 5 could not find a verified active ICAI resource for frontend verification.");
const updatesResponse = await fetch(`${baseUrl}/updates?phase5=${encodeURIComponent(correlationId)}`, { headers: { "cache-control": "no-cache" } });
if (!updatesResponse.ok) throw new Error(`Phase 5 /updates frontend verification returned ${updatesResponse.status}.`);
const updatesHtml = await updatesResponse.text();
const htmlEscaped = String(visibleTitle).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const jsonEscaped = JSON.stringify(String(visibleTitle)).slice(1, -1);
if (!updatesHtml.includes(String(visibleTitle)) && !updatesHtml.includes(htmlEscaped) && !updatesHtml.includes(jsonEscaped)) {
  throw new Error("Phase 5 verified canonical ICAI resource is not reflected on the student updates frontend.");
}
const resourcesResponse = await fetch(`${baseUrl}/resources/icai?phase5=${encodeURIComponent(correlationId)}`, { headers: { "cache-control": "no-cache" } });
if (!resourcesResponse.ok) throw new Error(`Phase 5 /resources/icai verification returned ${resourcesResponse.status}.`);
writeFileSync(`${evidenceDir}/icai-phase5-frontend.json`, JSON.stringify({ updates_status: updatesResponse.status, resources_status: resourcesResponse.status, visible_title: visibleTitle }, null, 2));

const foreignKeys = d1("PRAGMA foreign_key_check;");
if (foreignKeys.length) throw new Error(`Phase 5 left D1 foreign-key violations: ${JSON.stringify(foreignKeys).slice(0, 1000)}`);

writeFileSync(`${evidenceDir}/icai-phase5-summary.json`, JSON.stringify({
  status: "pass",
  correlationId,
  gitSha: sha,
  queue: queueName,
  realSyncRunId: realRun.id,
  realSyncStatus: realRun.status,
  sourceSucceeded: Number(realRun.source_succeeded),
  sourceFailed: Number(realRun.source_failed),
  selectedSourceId: selectedSource.id,
  terminalItems: itemRows.length,
  successfulItems: successfulItems.length,
  scheduler: "healthy_idle",
  reviewApproval: "approved_and_applied",
  reviewRejection: "rejected_without_mutation",
  frontend: "verified",
  publicInternalRoute: "blocked",
}, null, 2));
console.log(`ICAI Phase 5 live verification PASS (${correlationId}).`);
