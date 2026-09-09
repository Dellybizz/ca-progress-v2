import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for ICAI Phase 2 live verification.`);
  return value;
};

const accountId = required("CLOUDFLARE_ACCOUNT_ID");
const token = required("CLOUDFLARE_API_TOKEN");
const sha = required("GITHUB_SHA");
const githubRunId = required("GITHUB_RUN_ID");
const runAttempt = process.env.GITHUB_RUN_ATTEMPT || "1";
const correlationId = `${sha.slice(0, 12)}-${githubRunId}-${runAttempt}-phase2-repeat`.replace(/[^A-Za-z0-9._-]/g, "-");
const queueName = "ca-progress-v2-phase3-background";
const databaseName = "ca-progress-v2-phase4-shadow";
const evidenceDir = "deployment-evidence";
const POLL_MS = 5_000;
const POLL_ATTEMPTS = 100;
const sourceIds = [
  "icai-final-course",
  "icai-foundation-course",
  "icai-intermediate-course",
  "icai-exam-may-2026",
  "icai-exam-sep-nov-2026",
  "icai-bos-important-announcements",
];
mkdirSync(evidenceDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;

function d1(sql) {
  const stdout = execFileSync("npx", ["wrangler", "d1", "execute", databaseName, "--remote", "--config=wrangler.jsonc", "--json", "--command", sql], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(stdout || "[]")?.[0]?.results ?? [];
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

function watermarkRows() {
  return d1(`SELECT w.source_id,w.bootstrap_complete,w.bootstrap_completed_at,w.last_success_at,w.published_high_watermark,w.attempt_high_watermark,w.last_content_hash,s.last_success_at AS source_last_success_at FROM icai_source_watermarks w JOIN icai_sources s ON s.id=w.source_id WHERE s.is_active=1 AND s.id IN (${sourceIds.map(sqlText).join(",")}) ORDER BY w.source_id;`);
}

function assertLockedWatermarks(rows, label) {
  if (rows.length !== sourceIds.length) throw new Error(`${label}: expected ${sourceIds.length} source watermarks, found ${rows.length}.`);
  for (const row of rows) {
    if (Number(row.bootstrap_complete) !== 1 || !row.bootstrap_completed_at) throw new Error(`${label}: ${row.source_id} is not durably bootstrap-locked.`);
  }
}

async function waitForRoot(key) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const rows = d1(`SELECT idempotency_key,status,attempts,last_error FROM background_jobs WHERE idempotency_key=${sqlText(key)} LIMIT 1;`);
    const row = rows[0];
    if (row?.status === "dead_letter") throw new Error(`Phase 2 repeat root job dead-lettered: ${row.last_error ?? "unknown error"}`);
    if (row?.status === "succeeded") return row;
    await sleep(POLL_MS);
  }
  throw new Error("Phase 2 repeat root job did not succeed within the bounded poll window.");
}

async function waitForContinuation(startedAt) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const childJobs = d1(`SELECT idempotency_key,status,attempts,last_error,json_extract(payload_json,'$.runId') AS run_id FROM background_jobs WHERE job_type='icai-sync' AND json_extract(payload_json,'$.mode')='source' AND json_extract(payload_json,'$.phase2Correlation')=${sqlText(correlationId)} AND json_extract(payload_json,'$.gitSha')=${sqlText(sha)} ORDER BY idempotency_key;`);
    writeFileSync(`${evidenceDir}/icai-phase2-repeat-source-jobs.json`, JSON.stringify(childJobs, null, 2));
    const deadLetter = childJobs.find((row) => row.status === "dead_letter");
    if (deadLetter) throw new Error(`Phase 2 source continuation dead-lettered: ${deadLetter.idempotency_key}: ${deadLetter.last_error ?? "unknown error"}`);
    const runIds = [...new Set(childJobs.map((row) => String(row.run_id ?? "")).filter(Boolean))];
    if (runIds.length > 1) throw new Error(`Phase 2 repeat correlation resolved to multiple runs: ${runIds.join(", ")}.`);
    if (runIds.length === 1) {
      const run = d1(`SELECT id,status,started_at,completed_at,source_total,source_succeeded,source_failed,new_items,changed_items,unchanged_items,removed_items,pending_reviews,error_summary FROM icai_sync_runs WHERE id=${sqlText(runIds[0])} AND started_at>=${sqlText(startedAt)} LIMIT 1;`)[0];
      if (run && ["failed", "cancelled"].includes(run.status)) throw new Error(`Phase 2 repeat run ended ${run.status}: ${run.error_summary ?? "unknown error"}`);
      if (run && run.status === "success" && childJobs.length === Number(run.source_total) && childJobs.every((row) => row.status === "succeeded")) return { run, childJobs };
    }
    await sleep(POLL_MS);
  }
  throw new Error("Phase 2 repeat continuation did not reach verified success within the bounded poll window.");
}

const phase5Baseline = JSON.parse(readFileSync(`${evidenceDir}/icai-phase5-real-run.json`, "utf8"));
if (!phase5Baseline?.id || !["success", "partial"].includes(phase5Baseline.status)) throw new Error("Phase 2 requires the same-deployment Phase 5 real sync as its first baseline run.");

const beforeWatermarks = watermarkRows();
assertLockedWatermarks(beforeWatermarks, "before repeat sync");
const beforeResourceCount = Number(d1("SELECT COUNT(*) AS count FROM icai_resources;")[0]?.count ?? -1);
if (beforeResourceCount < 0) throw new Error("Phase 2 could not read the baseline ICAI resource count.");

const queueList = await cloudflare(`/accounts/${accountId}/queues`);
const queue = (queueList.result ?? []).find((item) => item.queue_name === queueName);
if (!queue?.queue_id) throw new Error(`Cloudflare Queue ${queueName} was not found.`);

const startedAt = new Date(Date.now() - 5_000).toISOString();
const repeatKey = `icai-phase2-repeat:${correlationId}`;
const push = await cloudflare(`/accounts/${accountId}/queues/${queue.queue_id}/messages`, {
  method: "POST",
  body: JSON.stringify({
    body: {
      id: `phase2-repeat-${correlationId}`,
      type: "icai-sync",
      idempotencyKey: repeatKey,
      payload: { trigger: "manual", requestedBy: null, phase2Correlation: correlationId, gitSha: sha },
      createdBy: null,
    },
  }),
});
writeFileSync(`${evidenceDir}/icai-phase2-repeat-push.json`, JSON.stringify(push, null, 2));
await waitForRoot(repeatKey);
const { run: repeatRun } = await waitForContinuation(startedAt);

if (Number(repeatRun.source_total) !== sourceIds.length || Number(repeatRun.source_succeeded) !== sourceIds.length || Number(repeatRun.source_failed) !== 0) {
  throw new Error(`Phase 2 repeat sync did not succeed across all six sources: ${JSON.stringify(repeatRun)}`);
}
if (Number(repeatRun.new_items) !== 0 || Number(repeatRun.changed_items) !== 0 || Number(repeatRun.removed_items) !== 0 || Number(repeatRun.pending_reviews) !== 0) {
  throw new Error(`Phase 2 repeat sync was not idempotent: new=${repeatRun.new_items}, changed=${repeatRun.changed_items}, removed=${repeatRun.removed_items}, reviews=${repeatRun.pending_reviews}.`);
}

const afterResourceCount = Number(d1("SELECT COUNT(*) AS count FROM icai_resources;")[0]?.count ?? -1);
if (afterResourceCount !== beforeResourceCount) throw new Error(`Phase 2 repeat sync changed resource cardinality (${beforeResourceCount} -> ${afterResourceCount}).`);

const afterWatermarks = watermarkRows();
assertLockedWatermarks(afterWatermarks, "after repeat sync");
const beforeBySource = new Map(beforeWatermarks.map((row) => [String(row.source_id), row]));
for (const row of afterWatermarks) {
  const before = beforeBySource.get(String(row.source_id));
  if (!before) throw new Error(`Phase 2 lost baseline watermark for ${row.source_id}.`);
  if (row.bootstrap_completed_at !== before.bootstrap_completed_at) throw new Error(`Phase 2 moved the immutable bootstrap boundary for ${row.source_id}.`);
  if (!row.last_success_at || row.last_success_at !== row.source_last_success_at || row.last_success_at < String(before.last_success_at ?? "")) throw new Error(`Phase 2 success watermark did not advance safely for ${row.source_id}.`);
  if (before.published_high_watermark && row.published_high_watermark < before.published_high_watermark) throw new Error(`Phase 2 publication watermark regressed for ${row.source_id}.`);
  if (before.attempt_high_watermark && row.attempt_high_watermark < before.attempt_high_watermark) throw new Error(`Phase 2 attempt watermark regressed for ${row.source_id}.`);
}

const fk = d1("PRAGMA foreign_key_check;");
if (fk.length) throw new Error(`Phase 2 repeat sync left D1 foreign-key violations: ${JSON.stringify(fk).slice(0, 1000)}`);

writeFileSync(`${evidenceDir}/icai-phase2-summary.json`, JSON.stringify({
  status: "pass",
  gitSha: sha,
  baselineRunId: phase5Baseline.id,
  repeatRunId: repeatRun.id,
  sources: sourceIds.length,
  resourceCount: afterResourceCount,
  newItemsOnRepeat: Number(repeatRun.new_items),
  changedItemsOnRepeat: Number(repeatRun.changed_items),
  bootstrapBoundary: "locked",
  watermarks: "advanced-on-success",
  foreignKeys: "clean",
}, null, 2));
console.log(`ICAI Phase 2 incremental idempotency verification PASS (${correlationId}).`);
