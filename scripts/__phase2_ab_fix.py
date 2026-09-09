from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def read(path): return (ROOT / path).read_text()
def write(path, text): (ROOT / path).write_text(text)
def replace_once(path, old, new):
    text = read(path)
    if text.count(old) != 1:
        raise RuntimeError(f"{path}: expected one match, found {text.count(old)}")
    write(path, text.replace(old, new, 1))
def regex_once(path, pattern, replacement):
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{path}: expected one regex match, found {count}")
    write(path, updated)

# ---------------------------------------------------------------------------
# Deployed Queue consumer: honor same-source cursor continuations, make
# finalization its own retryable job, and terminalize a source only after the
# failed batch has exhausted the existing Queue retry/backoff policy.
# ---------------------------------------------------------------------------
replace_once(
    "custom-worker.ts",
    'async function callIcaiService(env: WorkerEnv, path: "/start" | "/source" | "/finalize", body: Record<string, unknown>)',
    'async function callIcaiService(env: WorkerEnv, path: "/start" | "/source" | "/source/fail" | "/finalize", body: Record<string, unknown>)',
)
replace_once(
    "custom-worker.ts",
    '    requestIntervalSeconds?: number;\n',
    '    requestIntervalSeconds?: number;\n    cursorOffset?: number;\n    cursorTotal?: number;\n',
)

new_execute = r'''function icaiDelaySeconds(value: unknown) {
  const seconds = Number(value ?? 0);
  return Number.isFinite(seconds) ? Math.max(0, Math.min(60, Math.floor(seconds))) : 0;
}

function icaiSourceContext(job: BackgroundJob) {
  const runId = typeof job.payload.runId === "string" ? job.payload.runId : null;
  const sourceIds = Array.isArray(job.payload.sourceIds)
    ? job.payload.sourceIds.filter((value): value is string => typeof value === "string")
    : [];
  const sourceIndex = Number(job.payload.sourceIndex);
  if (!runId || !Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= sourceIds.length) {
    throw new Error("Invalid ICAI source continuation payload.");
  }
  return { runId, sourceIds, sourceIndex, sourceId: sourceIds[sourceIndex] };
}

async function queueIcaiFollowingStep(
  job: BackgroundJob,
  env: WorkerEnv,
  runId: string,
  sourceIds: string[],
  sourceIndex: number,
  delaySeconds = 0,
) {
  if (!env.BACKGROUND_JOBS) throw new Error("Background Queue binding is unavailable for ICAI continuation.");
  const nextIndex = sourceIndex + 1;
  if (nextIndex < sourceIds.length) {
    const nextSourceId = sourceIds[nextIndex];
    await env.BACKGROUND_JOBS.send({
      id: crypto.randomUUID(),
      type: "icai-sync",
      idempotencyKey: `icai-sync-source:${runId}:${nextIndex}:${nextSourceId}:cursor:0`,
      payload: { ...job.payload, mode: "source", runId, sourceIds, sourceIndex: nextIndex, cursorOffset: 0 },
      createdBy: job.createdBy ?? null,
    }, { delaySeconds: icaiDelaySeconds(delaySeconds) });
    return;
  }
  await env.BACKGROUND_JOBS.send({
    id: crypto.randomUUID(),
    type: "icai-sync",
    idempotencyKey: `icai-sync-finalize:${runId}`,
    payload: { ...job.payload, mode: "finalize", runId, sourceIds },
    createdBy: job.createdBy ?? null,
  });
}

async function executeIcaiQueueJob(job: BackgroundJob, env: WorkerEnv) {
  if (!env.BACKGROUND_JOBS) throw new Error("Background Queue binding is unavailable for ICAI continuation.");
  const mode = job.payload.mode;
  if (mode === "finalize") {
    const runId = typeof job.payload.runId === "string" ? job.payload.runId : null;
    if (!runId) throw new Error("Invalid ICAI finalization payload.");
    await callIcaiService(env, "/finalize", { runId });
    return;
  }
  if (mode === "source-fail") {
    const { runId, sourceIds, sourceIndex, sourceId } = icaiSourceContext(job);
    const terminalError = typeof job.payload.terminalError === "string"
      ? job.payload.terminalError.slice(0, 2000)
      : "ICAI source batch exhausted its retry limit.";
    const payload = await callIcaiService(env, "/source/fail", { runId, sourceId, errorMessage: terminalError });
    await queueIcaiFollowingStep(job, env, runId, sourceIds, sourceIndex, payload.result?.requestIntervalSeconds ?? 0);
    return;
  }
  if (mode === "source") {
    const { runId, sourceIds, sourceIndex, sourceId } = icaiSourceContext(job);
    const payload = await callIcaiService(env, "/source", { runId, sourceId });
    const result = payload.result;
    if (!result) throw new Error("ICAI service returned no source result.");
    if (result.status === "cancelled" || result.status === "paused") return;
    if (result.status === "continuing") {
      const cursor = Math.max(0, Math.floor(Number(result.cursorOffset ?? 0)));
      await env.BACKGROUND_JOBS.send({
        id: crypto.randomUUID(),
        type: "icai-sync",
        idempotencyKey: `icai-sync-source:${runId}:${sourceIndex}:${sourceId}:cursor:${cursor}`,
        payload: { ...job.payload, mode: "source", runId, sourceIds, sourceIndex, cursorOffset: cursor },
        createdBy: job.createdBy ?? null,
      }, { delaySeconds: icaiDelaySeconds(result.requestIntervalSeconds) });
      return;
    }
    await queueIcaiFollowingStep(job, env, runId, sourceIds, sourceIndex, result.requestIntervalSeconds ?? 0);
    return;
  }

  const trigger = job.payload.trigger === "manual" ? "manual" : job.payload.trigger === "test" ? "test" : "cron";
  const requestedBy = typeof job.payload.requestedBy === "string" ? job.payload.requestedBy : null;
  const payload = await callIcaiService(env, "/start", { trigger, requestedBy, orchestrationKey: job.idempotencyKey, requestedSourceIds: job.payload.requestedSourceIds, forceRecheck: job.payload.forceRecheck === true });
  const runId = payload.result?.runId;
  const sourceIds = payload.result?.sourceIds?.filter((value): value is string => typeof value === "string") ?? [];
  const firstSourceId = sourceIds[0];
  if (!runId || !firstSourceId) throw new Error("ICAI continuation returned no active sources.");
  await env.BACKGROUND_JOBS.send({
    id: crypto.randomUUID(),
    type: "icai-sync",
    idempotencyKey: `icai-sync-source:${runId}:0:${firstSourceId}:cursor:0`,
    payload: { ...job.payload, mode: "source", runId, sourceIds, sourceIndex: 0, cursorOffset: 0 },
    createdBy: job.createdBy ?? null,
  });
}

function scheduledJob'''
regex_once(
    "custom-worker.ts",
    r'async function executeIcaiQueueJob\(job: BackgroundJob, env: WorkerEnv\) \{.*?\n\}\n\nfunction scheduledJob',
    new_execute,
)

old_dead = '''    if (attempts >= maxAttempts || message.attempts >= maxAttempts) {\n      await env.DB.prepare("UPDATE background_jobs SET status='dead_letter',finished_at=CURRENT_TIMESTAMP,last_error=?1,updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=?2").bind(detail, job.idempotencyKey).run();'''
new_dead = '''    if (attempts >= maxAttempts || message.attempts >= maxAttempts) {\n      if (job.type === "icai-sync" && job.payload.mode === "source" && env.BACKGROUND_JOBS) {\n        const { runId, sourceIds, sourceIndex, sourceId } = icaiSourceContext(job);\n        await env.BACKGROUND_JOBS.send({\n          id: crypto.randomUUID(),\n          type: "icai-sync",\n          idempotencyKey: `icai-sync-source-fail:${runId}:${sourceIndex}:${sourceId}`,\n          payload: { ...job.payload, mode: "source-fail", runId, sourceIds, sourceIndex, terminalError: detail },\n          createdBy: job.createdBy ?? null,\n        });\n      }\n      await env.DB.prepare("UPDATE background_jobs SET status='dead_letter',finished_at=CURRENT_TIMESTAMP,last_error=?1,updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=?2").bind(detail, job.idempotencyKey).run();'''
replace_once("custom-worker.ts", old_dead, new_dead)
replace_once(
    "custom-worker.ts",
    'const retryDelaySeconds = Math.min(300, 15 * (2 ** Math.max(0, attempts - 1)));',
    'const retryDelaySeconds = job.type === "icai-sync" && job.payload.mode === "source"\n        ? Math.min(60, 15 * (2 ** Math.max(0, attempts - 1)))\n        : Math.min(300, 15 * (2 ** Math.max(0, attempts - 1)));',
)

# ---------------------------------------------------------------------------
# Private ICAI engine: transient batch failures stay retryable. The queue owns
# retries; only the explicit /source/fail path makes the source terminal.
# ---------------------------------------------------------------------------
old_catch = r'''    const skipped = error instanceof SyncSourceSkippedError;
    const message = skipped
      ? "Skipped by an administrator. Last verified data was preserved."
      : asErrorMessage(error);
    const { error: failureError } = await client.rpc("icai_sync_mark_source_failure", {
      p_run_id: runId,
      p_source_id: source.id,
      p_error: message,
    });
    if (failureError) throw failureError;
    await runtime.db.prepare("UPDATE icai_sync_source_states SET status=?1,finished_at=CURRENT_TIMESTAMP,last_error=?2,updated_at=CURRENT_TIMESTAMP WHERE run_id=?3 AND source_id=?4")
      .bind(skipped ? "skipped" : "failed", message.slice(0, 2000), runId, sourceId).run();
    return { runId, sourceId, status: skipped ? "skipped" : "failed", requestIntervalSeconds: source.requestIntervalSeconds, alreadyComplete: false };
  }
}

function summaryFromRun'''
new_catch = r'''    const skipped = error instanceof SyncSourceSkippedError;
    const message = skipped
      ? "Skipped by an administrator. Last verified data was preserved."
      : asErrorMessage(error);
    if (skipped) {
      const { error: failureError } = await client.rpc("icai_sync_mark_source_failure", {
        p_run_id: runId,
        p_source_id: source.id,
        p_error: message,
      });
      if (failureError) throw failureError;
      await runtime.db.prepare("UPDATE icai_sync_source_states SET status='skipped',finished_at=CURRENT_TIMESTAMP,last_error=?1,updated_at=CURRENT_TIMESTAMP WHERE run_id=?2 AND source_id=?3")
        .bind(message.slice(0, 2000), runId, sourceId).run();
      return { runId, sourceId, status: "skipped", requestIntervalSeconds: source.requestIntervalSeconds, alreadyComplete: false };
    }
    const failureContext = await runtime.db.prepare("SELECT stage,current_item_url FROM icai_sync_runtime WHERE run_id=?1 LIMIT 1")
      .bind(runId).first<{ stage: string | null; current_item_url: string | null }>();
    await runtime.db.batch([
      runtime.db.prepare("INSERT INTO icai_sync_item_failures(id,run_id,source_id,item_url,stage,failure_kind,error_message,skipped,occurred_at) VALUES(?1,?2,?3,?4,?5,'batch_retry',?6,0,CURRENT_TIMESTAMP)")
        .bind(crypto.randomUUID(), runId, source.id, failureContext?.current_item_url ?? source.officialUrl, failureContext?.stage ?? "unknown", message.slice(0, 1000)),
      runtime.db.prepare("UPDATE icai_sync_source_states SET last_error=?1,updated_at=CURRENT_TIMESTAMP WHERE run_id=?2 AND source_id=?3")
        .bind(message.slice(0, 2000), runId, sourceId),
    ]);
    throw error instanceof Error ? error : new Error(message);
  }
}

export async function failIcaiSyncContinuationSource(
  runtime: IcaiSyncRuntime,
  { runId, sourceId, errorMessage }: { runId: string; sourceId: string; errorMessage: string },
): Promise<IcaiSyncContinuationSourceResult> {
  if (!runtime.enabled) throw new Error("ICAI synchronization is disabled for this environment.");
  const client = adminClient(runtime);
  const sourceResponse = await client.from("icai_sources").select("*").eq("id", sourceId).eq("is_active", true).single();
  if (sourceResponse.error) throw sourceResponse.error;
  if (!sourceResponse.data) throw new Error(`ICAI source ${sourceId} is not active or does not exist.`);
  const source = sourceDto(sourceResponse.data as SourceRow);
  const state = await runtime.db.prepare("SELECT status FROM icai_sync_source_states WHERE run_id=?1 AND source_id=?2 LIMIT 1")
    .bind(runId, sourceId).first<{ status: string }>();
  if (!state) throw new Error(`ICAI continuation source state is missing for ${sourceId}.`);
  if (["succeeded", "failed", "skipped", "cancelled"].includes(state.status)) {
    return { runId, sourceId, status: state.status as IcaiSyncContinuationSourceResult["status"], requestIntervalSeconds: source.requestIntervalSeconds, alreadyComplete: true };
  }
  const message = String(errorMessage || "ICAI source batch exhausted its retry limit.").slice(0, 2000);
  const failureContext = await runtime.db.prepare("SELECT stage,current_item_url FROM icai_sync_runtime WHERE run_id=?1 LIMIT 1")
    .bind(runId).first<{ stage: string | null; current_item_url: string | null }>();
  const { error: failureError } = await client.rpc("icai_sync_mark_source_failure", {
    p_run_id: runId,
    p_source_id: source.id,
    p_error: message,
  });
  if (failureError) throw failureError;
  await runtime.db.batch([
    runtime.db.prepare("INSERT INTO icai_sync_item_failures(id,run_id,source_id,item_url,stage,failure_kind,error_message,skipped,occurred_at) VALUES(?1,?2,?3,?4,?5,'retry_exhausted',?6,0,CURRENT_TIMESTAMP)")
      .bind(crypto.randomUUID(), runId, source.id, failureContext?.current_item_url ?? source.officialUrl, failureContext?.stage ?? "unknown", message.slice(0, 1000)),
    runtime.db.prepare("UPDATE icai_sync_source_states SET status='failed',finished_at=CURRENT_TIMESTAMP,last_error=?1,updated_at=CURRENT_TIMESTAMP WHERE run_id=?2 AND source_id=?3")
      .bind(message, runId, sourceId),
  ]);
  return { runId, sourceId, status: "failed", requestIntervalSeconds: source.requestIntervalSeconds, alreadyComplete: false };
}

function summaryFromRun'''
replace_once("workers/icai-sync/sync-engine.ts", old_catch, new_catch)

# Private service endpoint for retry exhaustion terminalization.
replace_once(
    "workers/icai-sync/index.ts",
    '  finalizeIcaiSyncContinuationEngine,\n',
    '  failIcaiSyncContinuationSource,\n  finalizeIcaiSyncContinuationEngine,\n',
)
replace_once(
    "workers/icai-sync/index.ts",
    'type SyncRequest = { trigger?: unknown; requestedBy?: unknown; orchestrationKey?: unknown; runId?: unknown; sourceId?: unknown; requestedSourceIds?: unknown; forceRecheck?: unknown };',
    'type SyncRequest = { trigger?: unknown; requestedBy?: unknown; orchestrationKey?: unknown; runId?: unknown; sourceId?: unknown; errorMessage?: unknown; requestedSourceIds?: unknown; forceRecheck?: unknown };',
)
replace_once(
    "workers/icai-sync/index.ts",
    '["/run","/start","/source","/finalize"]',
    '["/run","/start","/source","/source/fail","/finalize"]',
)
replace_once(
    "workers/icai-sync/index.ts",
    '''      if(url.pathname==="/source"){\n        const runId=boundedString(body?.runId);\n        const sourceId=boundedString(body?.sourceId);\n        if(!runId||!sourceId)return json({ok:false,error:"runId and sourceId are required."},400);\n        const result=await runIcaiSyncContinuationSource(config,{runId,sourceId});\n        return json({ok:true,result});\n      }''',
    '''      if(url.pathname==="/source"||url.pathname==="/source/fail"){\n        const runId=boundedString(body?.runId);\n        const sourceId=boundedString(body?.sourceId);\n        if(!runId||!sourceId)return json({ok:false,error:"runId and sourceId are required."},400);\n        if(url.pathname==="/source/fail"){\n          const errorMessage=boundedString(body?.errorMessage,2000)||"ICAI source batch exhausted its retry limit.";\n          const result=await failIcaiSyncContinuationSource(config,{runId,sourceId,errorMessage});\n          return json({ok:true,result});\n        }\n        const result=await runIcaiSyncContinuationSource(config,{runId,sourceId});\n        return json({ok:true,result});\n      }''',
)

# Server wrapper/direct executor mirrors the same continuation contract.
replace_once(
    "lib/icai/sync.ts",
    'status:"continuing"|"succeeded"|"failed"|"skipped"|"cancelled";',
    'status:"continuing"|"paused"|"succeeded"|"failed"|"skipped"|"cancelled";',
)
replace_once(
    "lib/icai/sync.ts",
    'export async function runIcaiSyncSource({runId,sourceId}:{runId:string;sourceId:string}):Promise<IcaiSyncContinuationSourceResult>{const payload=await request<IcaiSyncContinuationSourceResult>("/source",{runId,sourceId});if(!payload.result)throw new Error("ICAI sync service returned no source result.");return payload.result;}\n',
    'export async function runIcaiSyncSource({runId,sourceId}:{runId:string;sourceId:string}):Promise<IcaiSyncContinuationSourceResult>{const payload=await request<IcaiSyncContinuationSourceResult>("/source",{runId,sourceId});if(!payload.result)throw new Error("ICAI sync service returned no source result.");return payload.result;}\nexport async function failIcaiSyncSource({runId,sourceId,errorMessage}:{runId:string;sourceId:string;errorMessage:string}):Promise<IcaiSyncContinuationSourceResult>{const payload=await request<IcaiSyncContinuationSourceResult>("/source/fail",{runId,sourceId,errorMessage});if(!payload.result)throw new Error("ICAI sync service returned no source failure result.");return payload.result;}\n',
)
replace_once(
    "lib/jobs/execute.ts",
    'import { finalizeIcaiSyncContinuation, runIcaiSyncSource, startIcaiSyncContinuation } from "@/lib/icai/sync";',
    'import { failIcaiSyncSource, finalizeIcaiSyncContinuation, runIcaiSyncSource, startIcaiSyncContinuation } from "@/lib/icai/sync";',
)

new_case = r'''    case "icai-sync": {
      const mode = job.payload.mode;
      const sourceIds = Array.isArray(job.payload.sourceIds) ? job.payload.sourceIds.filter((value): value is string => typeof value === "string") : [];
      const queueFollowing = async (runId: string, sourceIndex: number, delaySeconds = 0) => {
        const nextIndex = sourceIndex + 1;
        if (nextIndex < sourceIds.length) {
          const nextSourceId = sourceIds[nextIndex];
          await enqueueBackgroundJob({
            type: "icai-sync",
            idempotencyKey: `icai-sync-source:${runId}:${nextIndex}:${nextSourceId}:cursor:0`,
            payload: { ...job.payload, mode: "source", runId, sourceIds, sourceIndex: nextIndex, cursorOffset: 0 },
            createdBy: job.createdBy ?? null,
            delaySeconds,
          });
        } else {
          await enqueueBackgroundJob({
            type: "icai-sync",
            idempotencyKey: `icai-sync-finalize:${runId}`,
            payload: { ...job.payload, mode: "finalize", runId, sourceIds },
            createdBy: job.createdBy ?? null,
          });
        }
      };
      if (mode === "finalize") {
        const runId = typeof job.payload.runId === "string" ? job.payload.runId : null;
        if (!runId) throw new Error("Invalid ICAI finalization payload.");
        return finalizeIcaiSyncContinuation({ runId });
      }
      if (mode === "source" || mode === "source-fail") {
        const runId = typeof job.payload.runId === "string" ? job.payload.runId : null;
        const sourceIndex = Number(job.payload.sourceIndex);
        if (!runId || !Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= sourceIds.length) throw new Error("Invalid ICAI source continuation payload.");
        const sourceId = sourceIds[sourceIndex];
        const result = mode === "source-fail"
          ? await failIcaiSyncSource({ runId, sourceId, errorMessage: String(job.payload.terminalError ?? "ICAI source batch exhausted its retry limit.") })
          : await runIcaiSyncSource({ runId, sourceId });
        if (result.status === "cancelled" || result.status === "paused") return result;
        if (result.status === "continuing") {
          const cursor = Number(result.cursorOffset ?? 0);
          await enqueueBackgroundJob({
            type: "icai-sync",
            idempotencyKey: `icai-sync-source:${runId}:${sourceIndex}:${sourceId}:cursor:${cursor}`,
            payload: { ...job.payload, mode: "source", runId, sourceIds, sourceIndex, cursorOffset: cursor },
            createdBy: job.createdBy ?? null,
            delaySeconds: result.requestIntervalSeconds,
          });
          return result;
        }
        await queueFollowing(runId, sourceIndex, result.requestIntervalSeconds);
        return result;
      }
      const trigger = job.payload.trigger === "manual" ? "manual" : job.payload.trigger === "test" ? "test" : "cron";
      const requestedBy = typeof job.payload.requestedBy === "string" ? job.payload.requestedBy : null;
      const started = await startIcaiSyncContinuation({ trigger, requestedBy, orchestrationKey: job.idempotencyKey });
      const firstSourceId = started.sourceIds[0];
      if (!firstSourceId) throw new Error("ICAI continuation returned no active sources.");
      await enqueueBackgroundJob({
        type: "icai-sync",
        idempotencyKey: `icai-sync-source:${started.runId}:0:${firstSourceId}:cursor:0`,
        payload: { ...job.payload, mode: "source", runId: started.runId, sourceIds: started.sourceIds, sourceIndex: 0, cursorOffset: 0 },
        createdBy: job.createdBy ?? null,
      });
      return started;
    }
    case "icai-phase5-review-probe":'''
regex_once(
    "lib/jobs/execute.ts",
    r'    case "icai-sync": \{.*?\n    case "icai-phase5-review-probe":',
    new_case,
)

# ---------------------------------------------------------------------------
# Production proofs must count terminal sources, not Queue messages. Batching
# intentionally creates several source jobs per large source.
# ---------------------------------------------------------------------------
replace_once(
    "scripts/verify-icai-phase5-live.mjs",
    '        if (["success", "partial"].includes(realRun.status) && childJobs.length === sourceTotal && childJobs.every((row) => row.status === "succeeded")) {\n          const sourceStates = d1(`SELECT source_id,source_index,status,attempts,last_error,started_at,finished_at FROM icai_sync_source_states WHERE run_id=${sqlText(realRun.id)} ORDER BY source_index;`);',
    '        if (["success", "partial"].includes(realRun.status) && childJobs.length >= sourceTotal && childJobs.every((row) => row.status === "succeeded")) {\n          const sourceStates = d1(`SELECT source_id,source_index,status,attempts,last_error,started_at,finished_at,cursor_offset,cursor_total,continuation_count FROM icai_sync_source_states WHERE run_id=${sqlText(realRun.id)} ORDER BY source_index;`);',
)
replace_once(
    "scripts/verify-icai-phase5-live.mjs",
    'if (childJobs.length !== Number(realRun.source_total)) throw new Error("Phase 5 did not persist exactly one bounded source job per configured source.");',
    'if (childJobs.length < Number(realRun.source_total)) throw new Error("Phase 5 did not persist at least one bounded source job per configured source.");',
)

replace_once(
    "scripts/verify-icai-phase2-live.mjs",
    '      if (run && ["success", "partial"].includes(run.status) && childJobs.length === Number(run.source_total) && childJobs.every((row) => row.status === "succeeded")) return { run, childJobs };',
    '      if (run && ["success", "partial"].includes(run.status) && childJobs.length >= Number(run.source_total) && childJobs.every((row) => row.status === "succeeded")) {\n        const sourceStates = d1(`SELECT source_id,source_index,status,cursor_offset,cursor_total,continuation_count,last_error FROM icai_sync_source_states WHERE run_id=${sqlText(run.id)} ORDER BY source_index;`);\n        if (sourceStates.length !== Number(run.source_total) || sourceStates.some((row) => !["succeeded","failed","skipped"].includes(row.status))) throw new Error("Phase 2 continuation source states are incomplete.");\n        return { run, childJobs, sourceStates };\n      }',
)

# Focused regression contract.
test = r'''import test from "node:test";
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
'''
write("tests/icai-phase2ab-continuation.test.mjs", test)
replace_once(
    "package.json",
    'tests/icai-incremental-phase2.test.mjs\"',
    'tests/icai-incremental-phase2.test.mjs tests/icai-phase2ab-continuation.test.mjs\"',
)

# The helper itself is temporary and must not enter the verified tree.
(ROOT / "scripts/__phase2_ab_fix.py").unlink(missing_ok=True)
