from pathlib import Path
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    (ROOT / path).write_text(text)

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing patch anchor: {label}")
    return text.replace(old, new, 1)

# First materialize the already-audited Phase 3A-3D closure into this working tree.
old_helper = ROOT / "scripts/__phase3_abcd_finish.py"
if old_helper.exists():
    runpy.run_path(str(old_helper))

# Correct the one stale Phase 3A copy assertion from the previous verification run.
path = "tests/icai-sync-live-monitor-phase2.test.mjs"
text = read(path)
text = text.replace('assert.match(panel, /watch its progress/);', 'assert.match(panel, /Monitor official-source synchronization/);')
text = text.replace('assert.match(panel, /Synced resources and approval work live on a separate, simpler page/);', 'assert.match(panel, /keep content review separate from runtime operations/);')
write(path, text)

# Phase 3E: durable per-item lifecycle. Reuse Phase 2A skip/exclusion storage rather than duplicating it.
write("d1/migrations/0038_icai_phase3ef_item_isolation.sql", r'''-- ICAI Phase 3E/3F: durable nested-item lifecycle and targeted recovery.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS icai_sync_items (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES icai_sync_runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES icai_sources(id) ON DELETE CASCADE,
  item_url TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'nested_page',
  item_title TEXT,
  status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed','timed_out','skipped')),
  stage TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 20),
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  bytes_fetched INTEGER NOT NULL DEFAULT 0,
  parsed_count INTEGER NOT NULL DEFAULT 0,
  failure_category TEXT,
  failure_message TEXT,
  skip_reason TEXT,
  retry_eligible INTEGER NOT NULL DEFAULT 0 CHECK(retry_eligible IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(run_id,source_id,item_url)
);

CREATE INDEX IF NOT EXISTS icai_sync_items_run_status_idx
ON icai_sync_items(run_id,status,updated_at DESC);

CREATE INDEX IF NOT EXISTS icai_sync_items_source_status_idx
ON icai_sync_items(source_id,status,updated_at DESC);

ALTER TABLE icai_sync_runtime ADD COLUMN current_item_id TEXT;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0038','icai phase3ef durable item isolation and recovery','phase-12-operations-admin-platform');
''')

write("workers/icai-sync/item-isolation.ts", r'''import type { D1Database } from "./d1-client";

export type IcaiItemTerminalStatus = "succeeded" | "failed" | "timed_out" | "skipped";
export type IcaiItemResult = {
  itemUrl: string;
  status: IcaiItemTerminalStatus;
  stage: string;
  bytesFetched?: number;
  parsedCount?: number;
  failureCategory?: string | null;
  failureMessage?: string | null;
  skipReason?: string | null;
  retryEligible?: boolean;
};

export async function beginIcaiItemExecution(
  db: D1Database,
  runId: string,
  sourceId: string,
  itemUrl: string,
  itemTitle: string | null,
  itemType = "nested_page",
) {
  const id = crypto.randomUUID();
  const row = await db.prepare(
    "INSERT INTO icai_sync_items(id,run_id,source_id,item_url,item_type,item_title,status,stage,attempts,started_at,completed_at,duration_ms,bytes_fetched,parsed_count,failure_category,failure_message,skip_reason,retry_eligible,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,'running','fetching',1,CURRENT_TIMESTAMP,NULL,NULL,0,0,NULL,NULL,NULL,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(run_id,source_id,item_url) DO UPDATE SET item_type=excluded.item_type,item_title=excluded.item_title,status='running',stage='fetching',attempts=MIN(icai_sync_items.attempts+1,20),started_at=CURRENT_TIMESTAMP,completed_at=NULL,duration_ms=NULL,bytes_fetched=0,parsed_count=0,failure_category=NULL,failure_message=NULL,skip_reason=NULL,retry_eligible=0,updated_at=CURRENT_TIMESTAMP RETURNING id",
  ).bind(id, runId, sourceId, itemUrl, itemType, itemTitle).first<{ id: string }>();
  const itemId = row?.id ?? id;
  await db.prepare("UPDATE icai_sync_runtime SET current_item_id=?1,current_item_url=?2,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE run_id=?3")
    .bind(itemId, itemUrl, runId).run();
  return itemId;
}

export async function finishIcaiItemExecution(
  db: D1Database,
  runId: string,
  sourceId: string,
  result: IcaiItemResult,
) {
  await db.prepare(
    "UPDATE icai_sync_items SET status=?1,stage=?2,completed_at=CURRENT_TIMESTAMP,duration_ms=CASE WHEN started_at IS NULL THEN NULL ELSE MAX(0,CAST((julianday(CURRENT_TIMESTAMP)-julianday(started_at))*86400000 AS INTEGER)) END,bytes_fetched=?3,parsed_count=?4,failure_category=?5,failure_message=?6,skip_reason=?7,retry_eligible=?8,updated_at=CURRENT_TIMESTAMP WHERE run_id=?9 AND source_id=?10 AND item_url=?11",
  ).bind(
    result.status,
    result.stage,
    Math.max(0, Math.floor(result.bytesFetched ?? 0)),
    Math.max(0, Math.floor(result.parsedCount ?? 0)),
    result.failureCategory ?? null,
    result.failureMessage?.slice(0, 1000) ?? null,
    result.skipReason?.slice(0, 500) ?? null,
    result.retryEligible ? 1 : 0,
    runId,
    sourceId,
    result.itemUrl,
  ).run();
  await db.prepare("UPDATE icai_sync_runtime SET current_item_id=NULL,current_item_url=NULL,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE run_id=?1 AND current_item_url=?2")
    .bind(runId, result.itemUrl).run();
}
''')

# Resolver emits one lifecycle result for every nested ICAI page it attempts.
path = "workers/icai-sync/direct-resource-resolver.ts"
text = read(path)
text = replace_once(
    text,
    'export type IcaiItemFailure = { itemUrl: string; kind: string; message: string };',
    'export type IcaiItemFailure = { itemUrl: string; kind: string; message: string };\nexport type IcaiResolverItemResult = { itemUrl: string; status: "succeeded" | "failed" | "timed_out" | "skipped"; stage: string; bytesFetched?: number; parsedCount?: number; failureCategory?: string | null; failureMessage?: string | null; skipReason?: string | null; retryEligible?: boolean };',
    "resolver lifecycle type",
)
text = replace_once(
    text,
    '  onItem?: (itemUrl: string) => Promise<void>,\n) {',
    '  onItem?: (itemUrl: string, resource: ParsedIcaiResource) => Promise<void>,\n  onItemResult?: (result: IcaiResolverItemResult) => Promise<void>,\n) {',
    "resolver callback signature",
)
start = text.find('  const parseLanding = async (resource: ParsedIcaiResource): Promise<ParsedLanding | null> => {')
end = text.find('\n  const resolveStudyMaterial = async (', start)
if start < 0 or end < 0:
    raise SystemExit("missing patch anchor: parseLanding block")
new_parse = r'''  const parseLanding = async (resource: ParsedIcaiResource): Promise<ParsedLanding | null> => {
    if (visited.has(resource.officialUrl)) return null;
    visited.add(resource.officialUrl);
    await onItem?.(resource.officialUrl, resource);
    const finish = async (result: Omit<IcaiResolverItemResult, "itemUrl">) => {
      await onItemResult?.({ itemUrl: resource.officialUrl, ...result });
    };
    if (skippedUrls.has(resource.officialUrl)) {
      unavailableLandingPages += 1;
      recordFailure({ itemUrl: resource.officialUrl, kind: "operator_skip", message: "Skipped by an administrator." });
      await finish({ status: "skipped", stage: "excluded", skipReason: "operator_skip", retryEligible: false });
      return null;
    }
    if (Date.now() >= resolutionDeadline) {
      unavailableLandingPages += 1;
      recordFailure({ itemUrl: resource.officialUrl, kind: "source_budget", message: "Nested resolution time budget reached." });
      await finish({ status: "skipped", stage: "budget", skipReason: "source_budget", retryEligible: true });
      return null;
    }
    if (childPages >= MAX_CHILD_PAGES) {
      unavailableLandingPages += 1;
      recordFailure({ itemUrl: resource.officialUrl, kind: "page_limit", message: `Nested page limit ${MAX_CHILD_PAGES} reached.` });
      await finish({ status: "skipped", stage: "budget", skipReason: "page_limit", retryEligible: true });
      return null;
    }
    childPages += 1;
    let html: string | null;
    try {
      html = await fetchApprovedHtml(resource.officialUrl, userAgent, Math.min(source.timeoutMs, MAX_CHILD_TIMEOUT_MS));
    } catch (error) {
      unavailableLandingPages += 1;
      const detail = error instanceof Error ? error.message : "Nested ICAI page fetch failed.";
      const timedOut = /abort|timeout|timed out/i.test(detail);
      recordFailure({ itemUrl: resource.officialUrl, kind: timedOut ? "timeout" : "fetch_error", message: detail });
      await finish({ status: timedOut ? "timed_out" : "failed", stage: "fetching", failureCategory: timedOut ? "timeout" : "fetch_error", failureMessage: detail, retryEligible: true });
      return null;
    }
    if (html === null) {
      unavailableLandingPages += 1;
      recordFailure({ itemUrl: resource.officialUrl, kind: "not_found", message: "ICAI nested page returned 404 or 410." });
      await finish({ status: "failed", stage: "fetching", failureCategory: "not_found", failureMessage: "ICAI nested page returned 404 or 410.", retryEligible: false });
      return null;
    }
    try {
      const childSource: IcaiSourceConfig = { ...source, officialUrl: resource.officialUrl };
      const parsed = parseOfficialSource(html, childSource, subjects).resources.map((child) =>
        mergeContext(resource, child),
      );
      await finish({ status: "succeeded", stage: "parsed", bytesFetched: new TextEncoder().encode(html).byteLength, parsedCount: parsed.length, retryEligible: false });
      return { html, resources: parsed };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Nested ICAI page parsing failed.";
      recordFailure({ itemUrl: resource.officialUrl, kind: "parse_error", message: detail });
      await finish({ status: "failed", stage: "parsing", failureCategory: "parse_error", failureMessage: detail, retryEligible: true });
      return null;
    }
  };
'''
text = text[:start] + new_parse + text[end:]
write(path, text)

# Sync engine connects lifecycle records to existing source continuation and allows retry targets to bypass an active item exclusion once.
path = "workers/icai-sync/sync-engine.ts"
text = read(path)
text = replace_once(
    text,
    'import { resolveDirectStudyMaterialPdfs } from "./direct-resource-resolver";',
    'import { resolveDirectStudyMaterialPdfs } from "./direct-resource-resolver";\nimport { beginIcaiItemExecution, finishIcaiItemExecution } from "./item-isolation";',
    "engine lifecycle import",
)
text = replace_once(
    text,
    '  attempts: AttemptRow[],\n): Promise<boolean> {',
    '  attempts: AttemptRow[],\n  retryItemUrls: string[] = [],\n): Promise<boolean> {',
    "processSource retry args",
)
text = replace_once(
    text,
    '  const skippedUrls = new Set((skipRows.results ?? []).map((row) => row.item_url));\n  const direct = await resolveDirectStudyMaterialPdfs(',
    '  const skippedUrls = new Set((skipRows.results ?? []).map((row) => row.item_url));\n  for (const retryUrl of retryItemUrls) skippedUrls.delete(retryUrl);\n  const direct = await resolveDirectStudyMaterialPdfs(',
    "retry override exclusions",
)
text = replace_once(
    text,
    '''    async (itemUrl) => {
      await setStage(runtime.db, runId, "parsing", source.id, itemUrl);
      await checkpoint(runtime.db, runId);
    },
  );''',
    '''    async (itemUrl, resource) => {
      await setStage(runtime.db, runId, "parsing", source.id, itemUrl);
      await checkpoint(runtime.db, runId);
      await beginIcaiItemExecution(runtime.db, runId, source.id, itemUrl, resource.title, "nested_page");
    },
    async (result) => {
      await finishIcaiItemExecution(runtime.db, runId, source.id, result);
    },
  );''',
    "resolver lifecycle callbacks",
)
text = replace_once(
    text,
    '    forceRecheck?: boolean;\n  },',
    '    forceRecheck?: boolean;\n    retryItemUrls?: string[];\n  },',
    "start engine retry arg type",
)
text = replace_once(
    text,
    '  { trigger, requestedBy = null, orchestrationKey, requestedSourceIds = [], forceRecheck = false }: {',
    '  { trigger, requestedBy = null, orchestrationKey, requestedSourceIds = [], forceRecheck = false, retryItemUrls = [] }: {',
    "start destructure retry args",
)
text = replace_once(
    text,
    '    force_recheck: Boolean(forceRecheck),\n  });',
    '    force_recheck: Boolean(forceRecheck),\n    retry_item_urls: [...new Set(retryItemUrls)].slice(0, 50),\n  });',
    "run details retry urls",
)
text = replace_once(
    text,
    '  const forceRecheck = Boolean(parseDetails(run.details).force_recheck);\n  const effectiveSource = forceRecheck ? { ...source, etag: null, lastModified: null } : source;',
    '  const runDetails = parseDetails(run.details);\n  const forceRecheck = Boolean(runDetails.force_recheck);\n  const retryItemUrls = stringArray(runDetails.retry_item_urls).slice(0, 50);\n  const effectiveSource = forceRecheck ? { ...source, etag: null, lastModified: null } : source;',
    "run details parse retry urls",
)
text = replace_once(
    text,
    '      (attemptResponse.data ?? []) as AttemptRow[],\n    );',
    '      (attemptResponse.data ?? []) as AttemptRow[],\n      retryItemUrls,\n    );',
    "process source retry urls",
)
write(path, text)

# Internal ICAI service accepts a bounded item retry set.
path = "workers/icai-sync/index.ts"
text = read(path)
text = replace_once(text, 'forceRecheck?: unknown };', 'forceRecheck?: unknown; retryItemUrls?: unknown };', "service request retry urls")
text = replace_once(
    text,
    '        const result=await startIcaiSyncContinuationEngine(config,{trigger,requestedBy,orchestrationKey,requestedSourceIds,forceRecheck:body?.forceRecheck===true});',
    '        const retryItemUrls=Array.isArray(body?.retryItemUrls)?body.retryItemUrls.filter((value):value is string=>typeof value==="string"&&value.length<=2000).slice(0,50):[];\n        const result=await startIcaiSyncContinuationEngine(config,{trigger,requestedBy,orchestrationKey,requestedSourceIds,forceRecheck:body?.forceRecheck===true,retryItemUrls});',
    "service start retry urls",
)
write(path, text)

# Queue root forwards retry metadata; continuation jobs already preserve payload via object spread.
path = "custom-worker.ts"
text = read(path)
text = replace_once(
    text,
    'requestedSourceIds: job.payload.requestedSourceIds, forceRecheck: job.payload.forceRecheck === true });',
    'requestedSourceIds: job.payload.requestedSourceIds, forceRecheck: job.payload.forceRecheck === true, retryItemUrls: job.payload.retryItemUrls });',
    "queue retry item forwarding",
)
write(path, text)

# Admin actions: retry exact/failed/timed-out items via safe affected-source rescans; exclusions reuse the Phase 2A skip table.
path = "app/(admin)/admin/icai-sync/actions.ts"
text = read(path)
marker = 'export async function skipIcaiItemAction(formData: FormData) {'
item_actions = r'''export async function retryIcaiItemsAction(formData: FormData) {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminCapability("icai.run");
    const mode = String(formData.get("mode") ?? "failed");
    const requestedRunId = String(formData.get("runId") ?? "").trim();
    const itemId = String(formData.get("itemId") ?? "").trim();
    if (!["one", "failed", "timed_out"].includes(mode)) throw new Error("Invalid ICAI item retry request.");
    const admin = createD1AdminClient();
    const active = await admin.from("icai_sync_runs").select("id").eq("status", "running").limit(1).maybeSingle();
    if (active.error) throw active.error;
    if (active.data) throw new Error("Another ICAI synchronization is already active.");
    let originRunId = requestedRunId;
    let rows: Array<{ id: string; run_id: string; source_id: string; item_url: string }> = [];
    if (mode === "one") {
      if (!itemId) throw new Error("The ICAI item was not identified.");
      const item = await admin.from("icai_sync_items").select("id,run_id,source_id,item_url,retry_eligible").eq("id", itemId).maybeSingle();
      if (item.error) throw item.error;
      if (!item.data || !item.data.retry_eligible) throw new Error("This ICAI item is not eligible for retry.");
      originRunId = String(item.data.run_id);
      rows = [{ id: String(item.data.id), run_id: String(item.data.run_id), source_id: String(item.data.source_id), item_url: String(item.data.item_url) }];
    } else {
      if (!originRunId) {
        const latest = await admin.from("icai_sync_runs").select("id").order("started_at", { ascending: false }).limit(1).maybeSingle();
        if (latest.error) throw latest.error;
        originRunId = latest.data ? String(latest.data.id) : "";
      }
      if (!originRunId) throw new Error("No ICAI run is available for item retry.");
      const items = await admin.from("icai_sync_items").select("id,run_id,source_id,item_url,retry_eligible,status").eq("run_id", originRunId).eq("status", mode).eq("retry_eligible", true).order("updated_at", { ascending: false }).limit(50);
      if (items.error) throw items.error;
      rows = (items.data ?? []).map((item: Record<string, unknown>) => ({ id: String(item.id), run_id: String(item.run_id), source_id: String(item.source_id), item_url: String(item.item_url) }));
    }
    if (!rows.length) throw new Error(`No ${mode === "timed_out" ? "timed-out" : "failed"} ICAI items are eligible for retry.`);
    const sourceIds = [...new Set(rows.map((row) => row.source_id))];
    const retryItemUrls = [...new Set(rows.map((row) => row.item_url))].slice(0, 50);
    const scope = `${mode}:${originRunId}:${itemId || retryItemUrls.length}:${new Date().toISOString().slice(0, 16)}`;
    const job = await enqueueBackgroundJob({ type: "icai-sync", idempotencyKey: jobKey("icai-sync", "item-retry", scope), payload: { trigger: "manual", requestedBy: operator.user.id, requestedSourceIds: sourceIds, forceRecheck: true, retryItemUrls, retryOriginRunId: originRunId }, createdBy: operator.user.id });
    await recordAdminAuditEvent({ actorUserId: operator.user.id, actorRole: operator.role, capability: "icai.run", action: `icai.sync.retry_items.${mode}`, targetType: "background_job", targetId: job.id, reason: "Targeted ICAI item recovery", newValue: { originRunId, itemCount: retryItemUrls.length, sourceIds }, traceId: traceId(), reversible: false });
    destination = `/admin/icai-sync?notice=${encodeURIComponent(`Queued retry for ${retryItemUrls.length} item(s) across ${sourceIds.length} source(s).`)}`;
  } catch (error) { destination = `/admin/icai-sync?error=${encodeURIComponent(message(error))}`; }
  revalidatePath("/admin/icai-sync"); redirect(destination);
}

export async function excludeIcaiDiagnosticItemAction(formData: FormData) {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminCapability("icai.run");
    const sourceId = String(formData.get("sourceId") ?? "").trim();
    const itemUrl = String(formData.get("itemUrl") ?? "").trim();
    const scope = formData.get("scope") === "permanent" ? "permanent" : "temporary";
    if (!sourceId || itemUrl.length > 2000 || !isApprovedIcaiUrl(itemUrl)) throw new Error("Invalid ICAI item exclusion request.");
    const admin = createD1AdminClient();
    const existing = await admin.from("icai_sync_item_skips").select("id,is_active,scope,skipped_until").eq("source_id", sourceId).eq("item_url", itemUrl).maybeSingle();
    if (existing.error) throw existing.error;
    const now = new Date();
    const skippedUntil = scope === "temporary" ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString() : null;
    const values = { scope, reason: "Excluded from Phase 3 item diagnostics", skipped_until: skippedUntil, is_active: true, created_by: operator.user.id, updated_at: now.toISOString() };
    const saved = existing.data
      ? await admin.from("icai_sync_item_skips").update(values).eq("id", existing.data.id)
      : await admin.from("icai_sync_item_skips").insert({ id: crypto.randomUUID(), source_id: sourceId, item_url: itemUrl, ...values, created_at: now.toISOString() });
    if (saved.error) throw saved.error;
    await recordAdminAuditEvent({ actorUserId: operator.user.id, actorRole: operator.role, capability: "icai.run", action: "icai.sync.exclude_item", targetType: "icai_source_item", targetId: itemUrl, reason: `${scope} item exclusion`, previousValue: existing.data ?? null, newValue: { sourceId, scope, skippedUntil }, traceId: traceId(), reversible: true });
    destination = `/admin/icai-sync?notice=${encodeURIComponent(scope === "permanent" ? "ICAI item excluded until restored." : "ICAI item excluded for 24 hours.")}`;
  } catch (error) { destination = `/admin/icai-sync?error=${encodeURIComponent(message(error))}`; }
  revalidatePath("/admin/icai-sync"); redirect(destination);
}

'''
if 'export async function retryIcaiItemsAction' not in text:
    text = replace_once(text, marker, item_actions + marker, "item admin actions")
write(path, text)

# Dashboard DTO/query expose the latest run's item diagnostics.
path = "lib/icai/types.ts"
text = read(path)
text = replace_once(
    text,
    '  skippedItems: { id: string; sourceId: string; itemUrl: string; scope: string; skippedUntil: string | null }[];',
    '  itemDiagnostics: { id: string; runId: string; sourceId: string; itemUrl: string; itemType: string; itemTitle: string | null; status: string; stage: string; attempts: number; startedAt: string | null; completedAt: string | null; durationMs: number | null; bytesFetched: number; parsedCount: number; failureCategory: string | null; failureMessage: string | null; skipReason: string | null; retryEligible: boolean }[];\n  skippedItems: { id: string; sourceId: string; itemUrl: string; scope: string; skippedUntil: string | null }[];',
    "dashboard item diagnostics type",
)
write(path, text)

path = "lib/icai/query.ts"
text = read(path)
text = replace_once(
    text,
    '  const [snapshotResponse, runtimeResponse, sourceStateResponse] = run\n    ? await Promise.all([',
    '  const [snapshotResponse, runtimeResponse, sourceStateResponse, itemResponse] = run\n    ? await Promise.all([',
    "query item response tuple",
)
text = replace_once(
    text,
    '          .eq("run_id", run.id)\n          .order("source_index"),\n      ])',
    '          .eq("run_id", run.id)\n          .order("source_index"),\n        client.from("icai_sync_items").select("id,run_id,source_id,item_url,item_type,item_title,status,stage,attempts,started_at,completed_at,duration_ms,bytes_fetched,parsed_count,failure_category,failure_message,skip_reason,retry_eligible,updated_at").eq("run_id", run.id).order("updated_at", { ascending: false }).limit(100),\n      ])',
    "query item diagnostics",
)
text = replace_once(
    text,
    '        { data: [], error: null },\n      ];\n  const runDetailError = [snapshotResponse.error, runtimeResponse.error, sourceStateResponse.error].find(Boolean);',
    '        { data: [], error: null },\n        { data: [], error: null },\n      ];\n  const runDetailError = [snapshotResponse.error, runtimeResponse.error, sourceStateResponse.error, itemResponse.error].find(Boolean);',
    "query no-run item placeholder",
)
text = replace_once(
    text,
    '    skippedItems: ((skipResponse.data ?? []) as Array<Record<string, unknown>>).map((item) => ({ id: String(item.id), sourceId: String(item.source_id), itemUrl: String(item.item_url), scope: String(item.scope), skippedUntil: item.skipped_until ? String(item.skipped_until) : null })),',
    '    itemDiagnostics: ((itemResponse.data ?? []) as Array<Record<string, unknown>>).map((item) => ({ id: String(item.id), runId: String(item.run_id), sourceId: String(item.source_id), itemUrl: String(item.item_url), itemType: String(item.item_type), itemTitle: item.item_title ? String(item.item_title) : null, status: String(item.status), stage: String(item.stage), attempts: Number(item.attempts ?? 0), startedAt: item.started_at ? String(item.started_at) : null, completedAt: item.completed_at ? String(item.completed_at) : null, durationMs: item.duration_ms == null ? null : Number(item.duration_ms), bytesFetched: Number(item.bytes_fetched ?? 0), parsedCount: Number(item.parsed_count ?? 0), failureCategory: item.failure_category ? String(item.failure_category) : null, failureMessage: item.failure_message ? String(item.failure_message) : null, skipReason: item.skip_reason ? String(item.skip_reason) : null, retryEligible: Boolean(item.retry_eligible) })),\n    skippedItems: ((skipResponse.data ?? []) as Array<Record<string, unknown>>).map((item) => ({ id: String(item.id), sourceId: String(item.source_id), itemUrl: String(item.item_url), scope: String(item.scope), skippedUntil: item.skipped_until ? String(item.skipped_until) : null })),',
    "query return item diagnostics",
)
write(path, text)

# Add item recovery controls inside the already-progressively-disclosed Phase 3C operations panel.
path = "components/icai/admin-sync-monitor.tsx"
text = read(path)
text = replace_once(
    text,
    'import { excludeIcaiSourceAction, restoreIcaiItemAction, restoreIcaiSourceAction, runIcaiSyncAction, runTargetedIcaiSyncAction } from "@/app/(admin)/admin/icai-sync/actions";',
    'import { excludeIcaiDiagnosticItemAction, excludeIcaiSourceAction, restoreIcaiItemAction, restoreIcaiSourceAction, retryIcaiItemsAction, runIcaiSyncAction, runTargetedIcaiSyncAction } from "@/app/(admin)/admin/icai-sync/actions";',
    "monitor item action imports",
)
insert_marker = '        {dashboard.skippedItems.length ? <div className="icai-result-list">'
item_ui = r'''        {dashboard.latestRun && dashboard.itemDiagnostics.length ? <div className="icai-item-diagnostics">
          <div className="icai-section-heading"><div><span className="eyebrow">Item diagnostics</span><h3>Nested-page execution</h3><p className="icai-muted">A failed page is isolated from the rest of its source. Retry rescans only affected source(s) so canonical comparison remains complete.</p></div><Badge tone="neutral">{dashboard.itemDiagnostics.length} items</Badge></div>
          <div className="icai-runtime-actions">
            <form action={retryIcaiItemsAction}><input type="hidden" name="runId" value={dashboard.latestRun.id}/><input type="hidden" name="mode" value="failed"/><button className="ui-button ui-button--sm">Retry failed items</button></form>
            <form action={retryIcaiItemsAction}><input type="hidden" name="runId" value={dashboard.latestRun.id}/><input type="hidden" name="mode" value="timed_out"/><button className="ui-button ui-button--sm">Retry timed-out items</button></form>
          </div>
          <div className="icai-result-list">{dashboard.itemDiagnostics.map((item)=><article key={item.id}><span><i className={`is-${item.status}`}/><span><strong>{item.itemTitle ?? item.itemUrl}</strong><small>{item.status.replaceAll("_"," ")} · {item.attempts} attempt(s){item.durationMs == null ? "" : ` · ${item.durationMs}ms`}{item.failureMessage ? ` · ${item.failureMessage}` : ""}</small><a href={item.itemUrl} target="_blank" rel="noreferrer">Open ICAI page</a></span></span><div className="icai-runtime-actions">{item.retryEligible ? <form action={retryIcaiItemsAction}><input type="hidden" name="mode" value="one"/><input type="hidden" name="itemId" value={item.id}/><button className="ui-button ui-button--sm">Retry item</button></form> : null}<form action={excludeIcaiDiagnosticItemAction}><input type="hidden" name="sourceId" value={item.sourceId}/><input type="hidden" name="itemUrl" value={item.itemUrl}/><input type="hidden" name="scope" value="temporary"/><button className="ui-button ui-button--sm">Exclude 24h</button></form><form action={excludeIcaiDiagnosticItemAction}><input type="hidden" name="sourceId" value={item.sourceId}/><input type="hidden" name="itemUrl" value={item.itemUrl}/><input type="hidden" name="scope" value="permanent"/><button className="ui-button ui-button--sm">Exclude until restored</button></form></div></article>)}</div>
        </div> : null}
'''
if item_ui.strip() not in text:
    text = replace_once(text, insert_marker, item_ui + insert_marker, "monitor item diagnostics")
write(path, text)

# Retained migration chain + clean-D1 validator cover 0038.
path = "scripts/apply-retained-d1-migrations.mjs"
text = read(path)
text = replace_once(text, '  ["0037", "d1/migrations/0037_icai_phase3b_operator_controls.sql"],\n];', '  ["0037", "d1/migrations/0037_icai_phase3b_operator_controls.sql"],\n  ["0038", "d1/migrations/0038_icai_phase3ef_item_isolation.sql"],\n];', "retained 0038")
text = text.replace("BETWEEN '0012' AND '0037'", "BETWEEN '0012' AND '0038'")
write(path, text)

path = "scripts/validate-d1-hot-indexes.mjs"
text = read(path)
text = replace_once(text, '    ["0037", "0037_icai_phase3b_operator_controls.sql"],\n  ]) {', '    ["0037", "0037_icai_phase3b_operator_controls.sql"],\n    ["0038", "0038_icai_phase3ef_item_isolation.sql"],\n  ]) {', "validator 0038 journal")
anchor = '  assert(sourceColumns.includes("excluded_until") && sourceColumns.includes("exclusion_reason"), "ICAI Phase 3B source exclusion controls are missing");'
addition = anchor + '\n  assert(execute("SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'icai_sync_items\';").length === 1, "ICAI Phase 3E item lifecycle table is missing");\n  const itemColumns = execute("PRAGMA table_info(icai_sync_items);").map((row) => String(row.name));\n  for (const column of ["status", "attempts", "duration_ms", "bytes_fetched", "parsed_count", "failure_category", "retry_eligible"]) assert(itemColumns.includes(column), `ICAI Phase 3E item column ${column} is missing`);\n  assert(runtimeColumns.includes("current_item_id"), "ICAI Phase 3E runtime item identity is missing");\n  for (const index of ["icai_sync_items_run_status_idx", "icai_sync_items_source_status_idx"]) assert(indexes.includes(index), `ICAI Phase 3E index ${index} is missing`);'
text = replace_once(text, anchor, addition, "validator item schema")
write(path, text)

# Keep old migration-regression tests truthful through 0038.
path = "tests/icai-incremental-phase2.test.mjs"
text = read(path)
text = text.replace('test("Phase 2 retained migration remains covered through Phase 3B migration 0037",', 'test("Phase 2 retained migration remains covered through Phase 3EF migration 0038",')
text = text.replace("assert.match(retained, /BETWEEN '0012' AND '0037'/);", "assert.match(retained, /BETWEEN '0012' AND '0038'/);")
text = text.replace('  assert.match(retained, /\\["0037", "d1\\/migrations\\/0037_icai_phase3b_operator_controls\\.sql"\\]/);', '  assert.match(retained, /\\["0037", "d1\\/migrations\\/0037_icai_phase3b_operator_controls\\.sql"\\]/);\n  assert.match(retained, /\\["0038", "d1\\/migrations\\/0038_icai_phase3ef_item_isolation\\.sql"\\]/);')
write(path, text)

path = "tests/icai-resource-mapping-integrity.test.mjs"
text = read(path)
text = text.replace("through Phase 3B migration 0037", "through Phase 3EF migration 0038")
text = text.replace("BETWEEN '0012' AND '0037'", "BETWEEN '0012' AND '0038'")
if '0038_icai_phase3ef_item_isolation' not in text:
    text = text.replace('0037_icai_phase3b_operator_controls\\.sql/', '0037_icai_phase3b_operator_controls\\.sql/;\n  assert.match(retained, /0038_icai_phase3ef_item_isolation\\.sql/')
write(path, text)

# New Phase 3E/3F acceptance contract.
write("tests/icai-phase3ef-item-isolation.test.mjs", r'''import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 3E stores durable bounded lifecycle diagnostics for every nested ICAI page", () => {
  const migration = read("d1/migrations/0038_icai_phase3ef_item_isolation.sql");
  const isolation = read("workers/icai-sync/item-isolation.ts");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS icai_sync_items/);
  for (const field of ["duration_ms", "bytes_fetched", "parsed_count", "failure_category", "retry_eligible"]) assert.match(migration, new RegExp(field));
  assert.match(migration, /UNIQUE\(run_id,source_id,item_url\)/);
  assert.match(migration, /current_item_id/);
  assert.match(isolation, /beginIcaiItemExecution/);
  assert.match(isolation, /finishIcaiItemExecution/);
  assert.match(isolation, /attempts=MIN\(icai_sync_items\.attempts\+1,20\)/);
});

test("Phase 3E isolates nested fetch and parse failures without aborting the source", () => {
  const resolver = read("workers/icai-sync/direct-resource-resolver.ts");
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(resolver, /onItemResult/);
  assert.match(resolver, /status: timedOut \? "timed_out" : "failed"/);
  assert.match(resolver, /failureCategory: "not_found"/);
  assert.match(resolver, /failureCategory: "parse_error"/);
  assert.match(resolver, /status: "succeeded"/);
  assert.match(engine, /beginIcaiItemExecution/);
  assert.match(engine, /finishIcaiItemExecution/);
  assert.match(engine, /incomplete_nested_traversal: true/);
  assert.match(engine, /preserved_existing_resources/);
});

test("Phase 3F retries exact, failed, or timed-out items through affected-source Queue rescans", () => {
  const actions = read("app/(admin)/admin/icai-sync/actions.ts");
  const service = read("workers/icai-sync/index.ts");
  const worker = read("custom-worker.ts");
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(actions, /retryIcaiItemsAction/);
  assert.match(actions, /\["one", "failed", "timed_out"\]/);
  assert.match(actions, /requestedSourceIds: sourceIds/);
  assert.match(actions, /retryItemUrls/);
  assert.match(actions, /forceRecheck: true/);
  assert.match(actions, /jobKey\("icai-sync", "item-retry"/);
  assert.match(service, /retryItemUrls/);
  assert.match(worker, /retryItemUrls: job\.payload\.retryItemUrls/);
  assert.match(engine, /retry_item_urls/);
  assert.match(engine, /for \(const retryUrl of retryItemUrls\) skippedUrls\.delete\(retryUrl\)/);
});

test("Phase 3F item exclusions are reversible and reuse the canonical Phase 2A skip table", () => {
  const actions = read("app/(admin)/admin/icai-sync/actions.ts");
  const monitor = read("components/icai/admin-sync-monitor.tsx");
  assert.match(actions, /excludeIcaiDiagnosticItemAction/);
  assert.match(actions, /icai_sync_item_skips/);
  assert.match(actions, /24 \* 60 \* 60 \* 1000/);
  assert.match(actions, /icai\.sync\.exclude_item/);
  assert.match(actions, /reversible: true/);
  assert.match(actions, /restoreIcaiItemAction/);
  assert.match(monitor, /Retry failed items/);
  assert.match(monitor, /Retry timed-out items/);
  assert.match(monitor, /Retry item/);
  assert.match(monitor, /Exclude 24h/);
  assert.match(monitor, /Exclude until restored/);
});

test("Phase 3E/3F are permanent retained-D1 and focused ICAI regression gates", () => {
  const retained = read("scripts/apply-retained-d1-migrations.mjs");
  const validator = read("scripts/validate-d1-hot-indexes.mjs");
  const pkg = JSON.parse(read("package.json"));
  assert.match(retained, /0038_icai_phase3ef_item_isolation\.sql/);
  assert.match(retained, /BETWEEN '0012' AND '0038'/);
  assert.match(validator, /0038_icai_phase3ef_item_isolation\.sql/);
  assert.match(validator, /icai_sync_items/);
  assert.match(pkg.scripts["test:icai:phase5"], /icai-phase3ef-item-isolation\.test\.mjs/);
});
''')

# Focused ICAI suite permanently includes the A-F contracts.
path = "package.json"
pkg = json.loads(read(path))
script = pkg["scripts"]["test:icai:phase5"]
for test_file in ["tests/icai-phase3-admin.test.mjs", "tests/icai-phase3ef-item-isolation.test.mjs"]:
    if test_file not in script:
        script += f" {test_file}"
pkg["scripts"]["test:icai:phase5"] = script
write(path, json.dumps(pkg, indent=2) + "\n")

# Correct optional-chain assertion created by the A-D helper itself.
path = "tests/icai-phase3-admin.test.mjs"
text = read(path).replace(r'assert.match(live, /runtime\.currentSourceName/);', r'assert.match(live, /runtime\?\.currentSourceName/);')
write(path, text)

# Remove temporary verification machinery from the final generated tree.
(ROOT / "scripts/__phase3_af_finish.py").unlink(missing_ok=True)
(ROOT / ".github/workflows/__phase3-af-verify.yml").unlink(missing_ok=True)
