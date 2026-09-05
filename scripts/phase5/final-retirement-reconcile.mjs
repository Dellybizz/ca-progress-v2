import { writeFileSync } from "node:fs";
import { PHASE4_TABLES } from "../phase4/manifest.mjs";
import { normalizeRow, quoteIdentifier, sha256 } from "../phase4/core.mjs";
import { compareLegacyIdentities, compareSourceSubset } from "./retirement-reconcile-core.mjs";

const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"];
for (const key of required) if (!process.env[key]) throw new Error(`Final retirement reconciliation requires ${key}`);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN;
const d1Name = process.env.PHASE4_D1_NAME || "ca-progress-v2-phase4-shadow";
const runId = process.env.PHASE5_RETIREMENT_RUN_ID || `phase5-retirement-${Date.now()}`;
const targetRuntimeCommit = process.env.TARGET_RUNTIME_COMMIT || null;
const pageSize = Number(process.env.PHASE4_PAGE_SIZE || 200);
const reportPath = process.env.PHASE5_RETIREMENT_REPORT || "phase5-retirement-reconciliation.json";

const report = {
  schemaVersion: 1,
  phase: 5,
  mode: "retirement-source-subset",
  readOnly: true,
  runId,
  d1Name,
  targetRuntimeCommit,
  reconciliationCodeCommit: process.env.GITHUB_SHA || null,
  startedAt: new Date().toISOString(),
  identities: null,
  tables: [],
  storage: null,
  failures: [],
  discrepancies: [],
  foreignKeyViolations: null,
};

function sourceHeaders(extra = {}) {
  return { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, ...extra };
}

async function sourceFetch(path, init = {}) {
  return fetch(`${supabaseUrl}${path}`, { ...init, headers: { ...sourceHeaders(), ...(init.headers || {}) } });
}

async function fetchPublicTable(table, order = []) {
  const rows = [];
  let offset = 0;
  while (true) {
    const params = new URLSearchParams({ select: "*", limit: String(pageSize), offset: String(offset) });
    if (order.length) params.set("order", order.map((column) => `${column}.asc`).join(","));
    const response = await sourceFetch(`/rest/v1/${encodeURIComponent(table)}?${params}`);
    if (response.status === 404) {
      const text = await response.text();
      if (/PGRST205|Could not find the table|does not exist/i.test(text)) return null;
      throw new Error(`${table} source fetch failed: ${response.status} ${text.slice(0, 240)}`);
    }
    if (!response.ok) throw new Error(`${table} source fetch failed: ${response.status} ${(await response.text()).slice(0, 240)}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += page.length;
  }
  return rows;
}

async function fetchAuthUsers() {
  const users = [];
  let page = 1;
  while (true) {
    const response = await sourceFetch(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    if (!response.ok) throw new Error(`Supabase admin users failed: ${response.status}`);
    const body = await response.json();
    users.push(...(body.users || []));
    if (!body.next_page || body.next_page === page) break;
    page = body.next_page;
  }
  return users;
}

async function cloudflare(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cloudflareToken}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(`Cloudflare API ${path} failed: ${response.status} ${JSON.stringify(body.errors || body).slice(0, 500)}`);
  }
  return body.result;
}

async function resolveD1() {
  const listed = await cloudflare(`/d1/database?name=${encodeURIComponent(d1Name)}`);
  const database = Array.isArray(listed) ? listed.find((item) => item.name === d1Name) : null;
  if (!database) throw new Error(`D1 database ${d1Name} does not exist; retirement reconciliation is read-only and will not create it.`);
  return database.uuid || database.id;
}

let databaseId;
async function d1(sql, params = []) {
  const result = await cloudflare(`/d1/database/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify({ sql, params }),
  });
  const first = Array.isArray(result) ? result[0] : result;
  if (first?.success === false) throw new Error(`D1 query failed: ${JSON.stringify(first).slice(0, 500)}`);
  return first?.results || [];
}

async function tableColumns(table) {
  return (await d1(`PRAGMA table_info(${quoteIdentifier(table)});`)).map((row) => row.name);
}

async function verifyIdentities() {
  const legacyUsers = await fetchAuthUsers();
  const appUsers = await d1("SELECT user_id FROM app_users ORDER BY user_id;");
  const authIdentities = await d1("SELECT identity_id,provider,provider_user_id,application_user_id FROM auth_identities ORDER BY identity_id;");
  const comparison = compareLegacyIdentities(legacyUsers, appUsers, authIdentities);
  report.identities = comparison;
  if (!comparison.passed) report.discrepancies.push({ kind: "legacy_identity_reconciliation", ...comparison });
}

async function verifyTable(spec) {
  const source = await fetchPublicTable(spec.source, spec.pk);
  const targetColumns = await tableColumns(spec.source);
  if (!targetColumns.length) throw new Error(`D1 target table ${spec.source} is absent`);

  if (source === null) {
    if (!spec.optionalSource) throw new Error(`Required legacy source table ${spec.source} is absent`);
    const targetCount = Number((await d1(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(spec.source)};`))[0]?.count || 0);
    report.tables.push({ domain: spec.domain, table: spec.source, status: "source_absent", passed: true, sourceCount: 0, targetCount, extraTargetRows: targetCount });
    return;
  }

  const normalizedSource = source.map(normalizeRow);
  const sourceColumns = [...new Set(normalizedSource.flatMap((row) => Object.keys(row)))];
  const missingColumns = sourceColumns.filter((column) => !targetColumns.includes(column));
  if (missingColumns.length) {
    const discrepancy = { table: spec.source, kind: "target_missing_source_columns", columns: missingColumns };
    report.discrepancies.push(discrepancy);
    report.tables.push({ domain: spec.domain, table: spec.source, status: "failed", passed: false, sourceCount: source.length, missingColumns });
    return;
  }

  const comparableColumns = sourceColumns.length ? sourceColumns : spec.pk;
  const selectColumns = [...new Set([...spec.pk, ...comparableColumns])];
  const target = await d1(`SELECT ${selectColumns.map(quoteIdentifier).join(",")} FROM ${quoteIdentifier(spec.source)} ORDER BY ${spec.pk.map(quoteIdentifier).join(",")};`);
  const comparison = compareSourceSubset(normalizedSource, target.map(normalizeRow), spec.pk, comparableColumns);
  const entry = { domain: spec.domain, table: spec.source, status: comparison.passed ? "verified" : "failed", ...comparison };
  report.tables.push(entry);
  if (!comparison.passed) {
    report.discrepancies.push({
      table: spec.source,
      kind: "legacy_source_subset_mismatch",
      sourceCount: comparison.sourceCount,
      targetCount: comparison.targetCount,
      missingCount: comparison.missing.length,
      mismatchCount: comparison.mismatches.length,
      missing: comparison.missing.slice(0, 20),
      mismatches: comparison.mismatches.slice(0, 10),
    });
  }
}

async function listStorageObjects() {
  const bucketsResponse = await sourceFetch("/storage/v1/bucket");
  if (!bucketsResponse.ok) throw new Error(`Supabase storage bucket list failed: ${bucketsResponse.status}`);
  const buckets = await bucketsResponse.json();
  const objects = [];
  async function walk(bucket, prefix = "") {
    let offset = 0;
    while (true) {
      const response = await sourceFetch(`/storage/v1/object/list/${encodeURIComponent(bucket.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
      });
      if (!response.ok) throw new Error(`Supabase storage list failed for ${bucket.id}/${prefix}: ${response.status}`);
      const page = await response.json();
      for (const item of page) {
        const name = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) objects.push({ bucket: bucket.id, name });
        else await walk(bucket, name);
      }
      if (page.length < 100) break;
      offset += page.length;
    }
  }
  for (const bucket of buckets) await walk(bucket);
  return objects;
}

async function verifyStorage() {
  const objects = await listStorageObjects();
  const mappings = await d1("SELECT source_bucket,source_name,status,r2_bucket,r2_key FROM phase4_storage_objects ORDER BY source_bucket,source_name;").catch(() => []);
  const mappingByKey = new Map(mappings.map((row) => [`${row.source_bucket}/${row.source_name}`, row]));
  const missing = [];
  const unverified = [];
  for (const object of objects) {
    const key = `${object.bucket}/${object.name}`;
    const mapping = mappingByKey.get(key);
    if (!mapping) missing.push(key);
    else if (mapping.status !== "verified") unverified.push({ key, status: mapping.status });
  }
  report.storage = {
    passed: missing.length === 0 && unverified.length === 0,
    sourceObjects: objects.length,
    verifiedMappings: objects.length - missing.length - unverified.length,
    extraTargetMappings: Math.max(0, mappings.length - objects.length),
    missing,
    unverified,
  };
  if (!report.storage.passed) report.discrepancies.push({ kind: "legacy_storage_reconciliation", ...report.storage });
}

async function main() {
  databaseId = await resolveD1();
  report.databaseId = databaseId;
  await verifyIdentities();
  for (const spec of PHASE4_TABLES) await verifyTable(spec);
  await verifyStorage();
  const foreignKeys = await d1("PRAGMA foreign_key_check;");
  report.foreignKeyViolations = foreignKeys.length;
  if (foreignKeys.length) report.discrepancies.push({ kind: "foreign_key_check", count: foreignKeys.length, examples: foreignKeys.slice(0, 10) });

  report.legacyRowsVerified = report.tables.reduce((total, table) => total + Number(table.verifiedCount || 0), 0);
  report.extraTargetRowsPreserved = report.tables.reduce((total, table) => total + Number(table.extraTargetRows || 0), 0) + Number(report.identities?.extraAppUsers || 0);
  report.sourceFingerprint = sha256(report.tables.map(({ table, sourceCount, verifiedCount }) => ({ table, sourceCount, verifiedCount })));
  report.targetSupersetFingerprint = sha256(report.tables.map(({ table, targetCount, extraTargetRows }) => ({ table, targetCount, extraTargetRows })));
  report.completedAt = new Date().toISOString();
  report.status = report.failures.length === 0 && report.discrepancies.length === 0 && report.foreignKeyViolations === 0 ? "passed" : "failed";
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (report.status !== "passed") throw new Error(`Final retirement reconciliation failed: ${report.failures.length} failures, ${report.discrepancies.length} discrepancies, ${report.foreignKeyViolations} FK violations`);
  console.log(`Final retirement reconciliation PASS: ${report.legacyRowsVerified} legacy table rows verified; ${report.extraTargetRowsPreserved} Cloudflare-native target rows preserved.`);
}

main().catch((error) => {
  report.status = "failed";
  report.completedAt = new Date().toISOString();
  report.fatal = error instanceof Error ? error.stack || error.message : String(error);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.error(report.fatal);
  process.exitCode = 1;
});
