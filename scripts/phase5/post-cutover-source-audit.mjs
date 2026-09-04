import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { PHASE4_TABLES } from "../phase4/manifest.mjs";
import { hashRows, normalizeRow, quoteIdentifier, rowKey, stableStringify } from "../phase4/core.mjs";

const REQUIRED_ENV = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"];

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseTime(value) {
  if (!value) return Number.NaN;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizedComparable(row, columns) {
  const normalized = normalizeRow(row);
  return Object.fromEntries(columns.map((column) => [column, normalized[column] ?? null]));
}

export function classifyRowFreshness(sourceRow, targetRow, comparableColumns) {
  const source = normalizedComparable(sourceRow, comparableColumns);
  const target = normalizedComparable(targetRow, comparableColumns);
  if (stableStringify(source) === stableStringify(target)) return "equal";
  if (comparableColumns.includes("updated_at")) {
    const sourceTime = parseTime(source.updated_at);
    const targetTime = parseTime(target.updated_at);
    if (Number.isFinite(sourceTime) && Number.isFinite(targetTime)) {
      if (sourceTime > targetTime) return "source_newer";
      if (targetTime > sourceTime) return "d1_newer";
    }
  }
  return "content_mismatch_unknown_freshness";
}

export function evaluatePostCutoverAudit(report) {
  const changed = Array.isArray(report?.changedSinceFinalDeltaTables) ? report.changedSinceFinalDeltaTables : [];
  const pending = Array.isArray(report?.pendingSourceTables) ? report.pendingSourceTables : [];
  const auth = report?.auth ?? {};
  const baseline = report?.baselineFinalDelta ?? {};
  return {
    passed:
      baseline.status === "reconciled" &&
      number(baseline.failureCount) === 0 &&
      number(baseline.discrepancyCount) === 0 &&
      pending.length === 0 &&
      number(auth.missingAppUsers) === 0 &&
      number(auth.missingSupabaseIdentities) === 0,
    changedTableCount: changed.length,
    pendingTableCount: pending.length,
  };
}

async function cloudflare(path, init = {}) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const code = Array.isArray(body?.errors) && body.errors[0]?.code ? body.errors[0].code : response.status;
    throw new Error(`Cloudflare API request failed (${code})`);
  }
  return body.result;
}

async function resolveDatabaseId(name) {
  const listed = await cloudflare(`/d1/database?name=${encodeURIComponent(name)}`);
  const row = Array.isArray(listed) ? listed.find((entry) => entry?.name === name) : null;
  const id = row?.uuid || row?.id;
  if (!id) throw new Error(`D1 database ${name} was not found.`);
  return id;
}

async function query(databaseId, sql, params = []) {
  const result = await cloudflare(`/d1/database/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify({ sql, params }),
  });
  const envelope = Array.isArray(result) ? result[0] : result;
  if (envelope?.success === false) throw new Error("D1 query failed.");
  return Array.isArray(envelope?.results) ? envelope.results : [];
}

async function runAudit({
  sourcePath = process.env.RETIREMENT_SOURCE_EXPORT || "retirement-stage1/source-after/supabase-logical-export.json",
  outputPath = process.env.RETIREMENT_SOURCE_AUDIT || "retirement-stage1/evidence/post-cutover-source-audit.json",
  databaseName = process.env.PHASE4_D1_NAME || "ca-progress-v2-phase4-shadow",
} = {}) {
  for (const name of REQUIRED_ENV) if (!process.env[name]) throw new Error(`${name} is required.`);
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  const databaseId = await resolveDatabaseId(databaseName);
  const baselineRows = await query(
    databaseId,
    "SELECT source_table,status,source_count,source_hash,target_hash FROM phase4_migration_checkpoints WHERE run_id=?1",
    ["phase5-final-delta-v1"],
  );
  const baselineByTable = new Map(baselineRows.map((row) => [row.source_table, row]));
  const runRows = await query(
    databaseId,
    "SELECT run_id,status,failure_count,notes,completed_at FROM phase4_migration_runs WHERE run_id IN (?1,?2) ORDER BY started_at",
    ["phase5-final-delta-v1", "retirement-stage1-33928890767"],
  );
  const finalDeltaRun = runRows.find((row) => row.run_id === "phase5-final-delta-v1") || {};
  const incidentRun = runRows.find((row) => row.run_id === "retirement-stage1-33928890767") || {};
  let finalDeltaNotes = {};
  let incidentNotes = {};
  try { finalDeltaNotes = JSON.parse(finalDeltaRun.notes || "{}"); } catch {}
  try { incidentNotes = JSON.parse(incidentRun.notes || "{}"); } catch {}

  const tableSummaries = [];
  const changedSinceFinalDeltaTables = [];
  const pendingSourceTables = [];
  const d1DivergedTables = [];

  for (const spec of PHASE4_TABLES) {
    const sourceRows = source.tables?.[spec.source];
    const baseline = baselineByTable.get(spec.source) || null;
    if (sourceRows === null) {
      const changed = Boolean(baseline && baseline.status !== "source_absent");
      const summary = {
        table: spec.source,
        domain: spec.domain,
        sourceStatus: "source_absent",
        sourceCount: 0,
        baselineSourceCount: baseline ? number(baseline.source_count) : null,
        sourceChangedSinceFinalDelta: changed,
        sourceMissingInD1: 0,
        sourceNewerThanD1: 0,
        d1NewerThanSource: 0,
        unknownSamePkMismatch: 0,
        d1ExtraRows: null,
        pendingSourceWrite: changed,
      };
      tableSummaries.push(summary);
      if (changed) {
        changedSinceFinalDeltaTables.push(spec.source);
        pendingSourceTables.push(spec.source);
      }
      continue;
    }

    const normalizedSource = (sourceRows || []).map(normalizeRow);
    const currentSourceHash = hashRows(normalizedSource, spec.pk);
    const changed = !baseline || baseline.source_hash !== currentSourceHash;
    const info = await query(databaseId, `PRAGMA table_info(${quoteIdentifier(spec.source)})`);
    if (!info.length) throw new Error(`D1 table ${spec.source} is missing.`);
    const targetColumns = info.map((row) => String(row.name));
    const sourceColumns = sourceRows?.length ? Object.keys(sourceRows[0]).filter((column) => targetColumns.includes(column)) : [...spec.pk];
    for (const key of spec.pk) if (!sourceColumns.includes(key)) sourceColumns.push(key);
    const select = sourceColumns.map(quoteIdentifier).join(",");
    const order = spec.pk.map(quoteIdentifier).join(",");
    const targetRows = await query(databaseId, `SELECT ${select} FROM ${quoteIdentifier(spec.source)} ORDER BY ${order}`);
    const targetByKey = new Map(targetRows.map((row) => [rowKey(row, spec.pk), row]));
    const sourceKeys = new Set();
    let sourceMissingInD1 = 0;
    let sourceNewerThanD1 = 0;
    let d1NewerThanSource = 0;
    let unknownSamePkMismatch = 0;
    let equalRows = 0;

    for (const sourceRow of sourceRows || []) {
      const key = rowKey(sourceRow, spec.pk);
      sourceKeys.add(key);
      const targetRow = targetByKey.get(key);
      if (!targetRow) {
        sourceMissingInD1 += 1;
        continue;
      }
      const freshness = classifyRowFreshness(sourceRow, targetRow, sourceColumns);
      if (freshness === "equal") equalRows += 1;
      else if (freshness === "source_newer") sourceNewerThanD1 += 1;
      else if (freshness === "d1_newer") d1NewerThanSource += 1;
      else unknownSamePkMismatch += 1;
    }

    const d1ExtraRows = targetRows.filter((row) => !sourceKeys.has(rowKey(row, spec.pk))).length;
    const pendingSourceWrite = changed && (sourceMissingInD1 > 0 || sourceNewerThanD1 > 0 || unknownSamePkMismatch > 0);
    const d1Diverged = d1ExtraRows > 0 || d1NewerThanSource > 0 || unknownSamePkMismatch > 0;
    const summary = {
      table: spec.source,
      domain: spec.domain,
      sourceStatus: "present",
      sourceCount: sourceRows.length,
      baselineSourceCount: baseline ? number(baseline.source_count) : null,
      sourceChangedSinceFinalDelta: changed,
      sourceMissingInD1,
      sourceNewerThanD1,
      d1NewerThanSource,
      unknownSamePkMismatch,
      equalSourceRowsInD1: equalRows,
      d1ExtraRows,
      pendingSourceWrite,
    };
    tableSummaries.push(summary);
    if (changed) changedSinceFinalDeltaTables.push(spec.source);
    if (pendingSourceWrite) pendingSourceTables.push(spec.source);
    if (d1Diverged) d1DivergedTables.push(spec.source);
  }

  const sourceAuthIds = new Set((source.authUsers || []).map((user) => String(user.id)));
  const appUsers = await query(databaseId, "SELECT user_id FROM app_users");
  const identities = await query(databaseId, "SELECT application_user_id FROM auth_identities WHERE provider='supabase_auth'");
  const appIds = new Set(appUsers.map((row) => String(row.user_id)));
  const identityIds = new Set(identities.map((row) => String(row.application_user_id)));
  const auth = {
    sourceAuthUserCount: sourceAuthIds.size,
    d1AppUserCount: appIds.size,
    d1SupabaseIdentityCount: identityIds.size,
    missingAppUsers: [...sourceAuthIds].filter((id) => !appIds.has(id)).length,
    missingSupabaseIdentities: [...sourceAuthIds].filter((id) => !identityIds.has(id)).length,
  };

  const report = {
    schemaVersion: 1,
    audit: "post-cutover-supabase-source-read-only",
    generatedAt: new Date().toISOString(),
    database: databaseName,
    sourceBackupCreatedAt: source.createdAt,
    sourceBackupSha256: source.sha256 || null,
    baselineFinalDelta: {
      runId: "phase5-final-delta-v1",
      status: finalDeltaRun.status || null,
      failureCount: number(finalDeltaRun.failure_count),
      discrepancyCount: number(finalDeltaNotes.discrepancies),
      completedAt: finalDeltaRun.completed_at || null,
    },
    failedStage1ReconciliationIncident: {
      runId: "retirement-stage1-33928890767",
      status: incidentRun.status || null,
      failureCount: number(incidentRun.failure_count),
      discrepancyCount: number(incidentNotes.discrepancies),
      completedAt: incidentRun.completed_at || null,
      note: "Recorded for provenance only. Stage 1 no longer runs source-authoritative reconciliation after cutover.",
    },
    auth,
    changedSinceFinalDeltaTables,
    pendingSourceTables,
    d1DivergedTables,
    tableSummaries,
  };
  report.summary = {
    tablesAudited: tableSummaries.length,
    sourceChangedSinceFinalDelta: changedSinceFinalDeltaTables.length,
    pendingSourceWrites: pendingSourceTables.length,
    d1DivergedFromSource: d1DivergedTables.length,
    missingAuthMappings: auth.missingAppUsers + auth.missingSupabaseIdentities,
  };
  report.status = evaluatePostCutoverAudit(report).passed ? "passed" : "failed";
  await mkdir(new URL(".", pathToFileURL(outputPath)), { recursive: true }).catch(() => {});
  await mkdir(outputPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    status: report.status,
    changedSinceFinalDeltaTables,
    pendingSourceTables,
    d1DivergedTableCount: d1DivergedTables.length,
    auth,
  }, null, 2));
  if (report.status !== "passed") process.exitCode = 1;
  return report;
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) {
  runAudit().catch((error) => {
    console.error(`Post-cutover source audit failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
