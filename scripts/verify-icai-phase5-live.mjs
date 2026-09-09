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
const evidenceDir = "deployment-evidence";
const JOB_POLL_INTERVAL_MS = 5_000;
const JOB_POLL_ATTEMPTS = 90;
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
  for (let attempt = 0; attempt < JOB_POLL_ATTEMPTS; attempt += 1) {
    const rows = d1(`SELECT idempotency_key,status,attempts,last_error,started_at,finished_at FROM background_jobs WHERE idempotency_key IN (${keys.map(sqlText).join(",")}) ORDER BY idempotency_key;`);
    writeFileSync(`${evidenceDir}/icai-phase5-background-jobs.json`, JSON.stringify(rows, null, 2));
    const terminalFailure = rows.find((row) => row.status === "dead_letter");
    if (terminalFailure) throw new Error(`Phase 5 queue job dead-lettered: ${terminalFailure.idempotency_key}: ${terminalFailure.last_error ?? "unknown error"}`);
    if (rows.length === keys.length && rows.every((row) => row.status === "succeeded")) return rows;
    await sleep(JOB_POLL_INTERVAL_MS);
  }
  throw new Error(`Phase 5 queue jobs did not both reach succeeded state within ${(JOB_POLL_ATTEMPTS * JOB_POLL_INTERVAL_MS) / 1000} seconds.`);
}

async function waitForIcaiContinuation(startedAt) {
  for (let attempt = 0; attempt < JOB_POLL_ATTEMPTS; attempt += 1) {
    const childJobs = d1(`SELECT idempotency_key,status,attempts,last_error,payload_json,json_extract(payload_json,'$.runId') AS run_id,started_at,finished_at FROM background_jobs WHERE job_type='icai-sync' AND json_extract(payload_json,'$.mode')='source' AND json_extract(payload_json,'$.phase5Correlation')=${sqlText(correlationId)} AND json_extract(payload_json,'$.gitSha')=${sqlText(sha)} ORDER BY idempotency_key;`);
    writeFileSync(`${evidenceDir}/icai-phase5-source-jobs.json`, JSON.stringify(childJobs, null, 2));
    const runIds = [...new Set(childJobs.map((row) => String(row.run_id ?? "")).filter(Boolean))];
    if (runIds.length > 1) throw new Error(`Phase 5 correlation resolved to multiple ICAI runs: ${runIds.join(", ")}.`);
    const matchingRunId = runIds[0];
    if (matchingRunId) {
      const realRuns = d1(`SELECT id,status,trigger_type,parser_version,started_at,completed_at,source_total,source_succeeded,source_failed,new_items,changed_items,unchanged_items,removed_items,pending_reviews,error_summary FROM icai_sync_runs WHERE id=${sqlText(matchingRunId)} AND trigger_type='manual' AND parser_version='phase8.1' AND started_at >= ${sqlText(startedAt)} LIMIT 1;`);
      const realRun = realRuns[0];
      if (realRun) {
        const deadLetter = childJobs.find((row) => row.status === "dead_letter");
        if (deadLetter) throw new Error(`Phase 5 ICAI source continuation dead-lettered: ${deadLetter.idempotency_key}: ${deadLetter.last_error ?? "unknown error"}`);
        if (["failed", "cancelled"].includes(realRun.status)) throw new Error(`Phase 5 real ICAI continuation ended ${realRun.status}: ${realRun.error_summary ?? "unknown error"}`);
        const sourceTotal = Number(realRun.source_total);
        if (["success", "partial"].includes(realRun.status) && childJobs.length === sourceTotal && childJobs.every((row) => row.status === "succeeded")) {
          const sourceStates = d1(`SELECT source_id,source_index,status,attempts,last_error,started_at,finished_at FROM icai_sync_source_states WHERE run_id=${sqlText(realRun.id)} ORDER BY source_index;`);
          writeFileSync(`${evidenceDir}/icai-phase5-source-states.json`, JSON.stringify(sourceStates, null, 2));
          if (sourceStates.length !== sourceTotal || sourceStates.some((row) => !["succeeded", "failed", "skipped"].includes(row.status))) throw new Error("Phase 5 continuation source states are incomplete.");
          return { realRun, childJobs, sourceStates };
        }
      }
    }
    await sleep(JOB_POLL_INTERVAL_MS);
  }
  throw new Error(`Phase 5 ICAI continuation did not reach a verified terminal state within ${(JOB_POLL_ATTEMPTS * JOB_POLL_INTERVAL_MS) / 1000} seconds.`);
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
const syncKey = `icai-phase5-sync:${correlationId}`;
await publish(queue.queue_id, {
  id: `phase5-sync-${correlationId}`,
  type: "icai-sync",
  idempotencyKey: syncKey,
  payload: { trigger: "manual", requestedBy: null, phase5Correlation: correlationId, gitSha: sha },
  createdBy: null,
}, "icai-phase5-sync-push.json");
await waitForJobs([syncKey]);
const { realRun, childJobs } = await waitForIcaiContinuation(startedAt);
if (Number(realRun.source_succeeded) < 1) {
  throw new Error(`Phase 5 real ICAI sync did not verify an official source: status=${realRun.status}, succeeded=${realRun.source_succeeded}, failed=${realRun.source_failed}.`);
}
if (childJobs.length !== Number(realRun.source_total)) throw new Error("Phase 5 did not persist exactly one bounded source job per configured source.");
writeFileSync(`${evidenceDir}/icai-phase5-real-run.json`, JSON.stringify(realRun, null, 2));

const snapshots = d1(`SELECT ss.id,ss.source_id,ss.fetched_at,ss.http_status,ss.canonical_hash,ss.parsed_item_count,s.official_url FROM icai_source_snapshots ss JOIN icai_sources s ON s.id=ss.source_id WHERE ss.run_id=${sqlText(realRun.id)} ORDER BY ss.source_id;`);
if (!snapshots.length || !snapshots.some((row) => Number(row.http_status) === 200 || Number(row.http_status) === 304)) {
  throw new Error("Phase 5 real sync produced no successful official-source snapshot.");
}
if (snapshots.some((row) => !/^https?:\/\/([a-z0-9-]+\.)*icai\.org(?:\/|$)/i.test(String(row.official_url)))) {
  throw new Error("Phase 5 snapshot evidence includes a non-ICAI source URL.");
}
writeFileSync(`${evidenceDir}/icai-phase5-source-snapshots.json`, JSON.stringify(snapshots, null, 2));

// Certify the real bootstrap before adding an isolated review probe to the same
// intentionally single-concurrency queue. A diagnostic job must never delay the
// production source continuation chain.
const reviewKey = `icai-phase5-review:${correlationId}`;
await publish(queue.queue_id, {
  id: `phase5-review-${correlationId}`,
  type: "icai-phase5-review-probe",
  idempotencyKey: reviewKey,
  payload: { correlationId, gitSha: sha },
  createdBy: null,
}, "icai-phase5-review-push.json");
await waitForJobs([reviewKey]);

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
  reviewApproval: "approved_and_applied",
  reviewRejection: "rejected_without_mutation",
  frontend: "verified",
  publicInternalRoute: "blocked",
}, null, 2));
console.log(`ICAI Phase 5 live verification PASS (${correlationId}).`);