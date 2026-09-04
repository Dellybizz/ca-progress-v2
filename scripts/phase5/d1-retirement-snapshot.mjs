import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const RETIREMENT_HEALTH_TABLES = Object.freeze([
  "app_users",
  "chapter_progress",
  "tasks",
  "goals",
  "user_calendar_events",
  "community_channels",
  "community_messages",
  "uploaded_resources",
  "subscription_plans",
  "user_subscriptions",
  "payment_orders",
]);

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Unsafe D1 identifier: ${value}`);
  return `"${value}"`;
}

async function cf(path, init = {}) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) throw new Error("Cloudflare account/token are required for the D1 retirement snapshot.");
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
    throw new Error(`Cloudflare D1 API request failed (${code}).`);
  }
  return body.result;
}

async function resolveDatabaseId(databaseName) {
  const listed = await cf(`/d1/database?name=${encodeURIComponent(databaseName)}`);
  const match = Array.isArray(listed) ? listed.find((item) => item?.name === databaseName) : null;
  const id = match?.uuid || match?.id;
  if (!id) throw new Error(`D1 database ${databaseName} was not found.`);
  return id;
}

async function query(databaseId, sql) {
  const result = await cf(`/d1/database/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify({ sql }),
  });
  const envelope = Array.isArray(result) ? result[0] : result;
  if (envelope?.success === false) throw new Error("D1 query failed.");
  return Array.isArray(envelope?.results) ? envelope.results : [];
}

export async function captureD1RetirementSnapshot({
  databaseName = process.env.PHASE4_D1_NAME || "ca-progress-v2-phase4-shadow",
  outputDir = process.env.RETIREMENT_STAGE1_EVIDENCE_DIR || "retirement-stage1/evidence",
} = {}) {
  const databaseId = await resolveDatabaseId(databaseName);
  const counts = {};
  for (const table of RETIREMENT_HEALTH_TABLES) {
    const rows = await query(databaseId, `SELECT COUNT(*) AS n FROM ${quoteIdentifier(table)}`);
    const count = Number(rows[0]?.n);
    if (!Number.isFinite(count) || count < 0) throw new Error(`Invalid count returned for ${table}.`);
    counts[table] = count;
  }
  const foreignKeyRows = await query(databaseId, "PRAGMA foreign_key_check");
  if (foreignKeyRows.length) throw new Error(`Production D1 has ${foreignKeyRows.length} foreign-key violations.`);
  if (!(counts.app_users > 0)) throw new Error("Production D1 application-user count is not sane.");

  const bookmarkResult = await cf(`/d1/database/${databaseId}/time_travel/bookmark`);
  const bookmark = String(bookmarkResult?.bookmark || "");
  if (!bookmark) throw new Error("D1 Time Travel bookmark was not returned.");

  const health = {
    schemaVersion: 1,
    database: databaseName,
    capturedAt: new Date().toISOString(),
    foreignKeyViolations: 0,
    counts,
  };
  const rollback = {
    schemaVersion: 1,
    database: databaseName,
    capturedAt: health.capturedAt,
    bookmark,
    retentionNote: "Time Travel retention is controlled by the Cloudflare D1 plan; the durable SQL export is retained separately in R2.",
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(`${outputDir}/d1-health.json`, `${JSON.stringify(health, null, 2)}\n`);
  await writeFile(`${outputDir}/d1-bookmark.json`, `${JSON.stringify(rollback, null, 2)}\n`);
  console.log(JSON.stringify({
    database: databaseName,
    foreignKeyViolations: 0,
    counts,
    bookmarkCaptured: true,
  }, null, 2));
  return { health, rollback };
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) {
  captureD1RetirementSnapshot().catch((error) => {
    console.error(`D1 retirement snapshot failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
