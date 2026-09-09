from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str):
    target = ROOT / path
    text = target.read_text()
    if text.count(old) != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {text.count(old)}")
    target.write_text(text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str):
    target = ROOT / path
    text = target.read_text()
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"Expected exactly one regex match in {path}, found {count}")
    target.write_text(updated)


migration = r'''-- ICAI Phase 2 — durable incremental checkpoint state.
-- Phase 1's adapter_config bootstrap flag remains as a compatibility mirror, while
-- this table becomes the durable per-source lock/high-water record used by Phase 2.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS icai_source_watermarks (
  source_id TEXT PRIMARY KEY REFERENCES icai_sources(id) ON DELETE CASCADE,
  bootstrap_complete INTEGER NOT NULL DEFAULT 0 CHECK(bootstrap_complete IN (0,1)),
  bootstrap_completed_at TEXT,
  last_success_at TEXT,
  published_high_watermark TEXT,
  attempt_high_watermark TEXT,
  last_content_hash TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Preserve the already-certified Phase 1 lock when this migration reaches
-- production. A fresh database remains unlocked until its first successful sync.
INSERT OR IGNORE INTO icai_source_watermarks(
  source_id,
  bootstrap_complete,
  bootstrap_completed_at,
  last_success_at,
  published_high_watermark,
  attempt_high_watermark,
  last_content_hash,
  updated_at
)
SELECT
  s.id,
  CASE WHEN json_extract(s.adapter_config,'$.bootstrap_complete') = 1 THEN 1 ELSE 0 END,
  CASE
    WHEN json_extract(s.adapter_config,'$.bootstrap_complete') = 1
      THEN COALESCE(json_extract(s.adapter_config,'$.bootstrap_completed_at'), s.last_success_at)
    ELSE NULL
  END,
  s.last_success_at,
  (SELECT MAX(NULLIF(r.published_on,'')) FROM icai_resources r WHERE r.source_id=s.id),
  (SELECT MAX(a.attempt_key) FROM exam_attempts a WHERE a.source_id=s.id),
  s.last_content_hash,
  CURRENT_TIMESTAMP
FROM icai_sources s
WHERE s.is_active=1;

-- icai_sources.last_success_at is written only from the successful source path.
-- Centralizing advancement here therefore makes failed/aborted runs incapable of
-- moving the Phase 2 checkpoint.
CREATE TRIGGER IF NOT EXISTS icai_source_watermark_after_success
AFTER UPDATE OF last_success_at ON icai_sources
WHEN NEW.last_success_at IS NOT NULL
 AND COALESCE(OLD.last_success_at,'') <> COALESCE(NEW.last_success_at,'')
BEGIN
  INSERT INTO icai_source_watermarks(
    source_id,
    bootstrap_complete,
    bootstrap_completed_at,
    last_success_at,
    published_high_watermark,
    attempt_high_watermark,
    last_content_hash,
    updated_at
  )
  VALUES(
    NEW.id,
    1,
    COALESCE(
      (SELECT bootstrap_completed_at FROM icai_source_watermarks WHERE source_id=NEW.id),
      json_extract(NEW.adapter_config,'$.bootstrap_completed_at'),
      NEW.last_success_at
    ),
    NEW.last_success_at,
    (SELECT MAX(NULLIF(r.published_on,'')) FROM icai_resources r WHERE r.source_id=NEW.id),
    (SELECT MAX(a.attempt_key) FROM exam_attempts a WHERE a.source_id=NEW.id),
    NEW.last_content_hash,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT(source_id) DO UPDATE SET
    bootstrap_complete=1,
    bootstrap_completed_at=COALESCE(icai_source_watermarks.bootstrap_completed_at, excluded.bootstrap_completed_at),
    last_success_at=excluded.last_success_at,
    published_high_watermark=CASE
      WHEN icai_source_watermarks.published_high_watermark IS NULL THEN excluded.published_high_watermark
      WHEN excluded.published_high_watermark IS NULL THEN icai_source_watermarks.published_high_watermark
      WHEN excluded.published_high_watermark > icai_source_watermarks.published_high_watermark THEN excluded.published_high_watermark
      ELSE icai_source_watermarks.published_high_watermark
    END,
    attempt_high_watermark=CASE
      WHEN icai_source_watermarks.attempt_high_watermark IS NULL THEN excluded.attempt_high_watermark
      WHEN excluded.attempt_high_watermark IS NULL THEN icai_source_watermarks.attempt_high_watermark
      WHEN excluded.attempt_high_watermark > icai_source_watermarks.attempt_high_watermark THEN excluded.attempt_high_watermark
      ELSE icai_source_watermarks.attempt_high_watermark
    END,
    last_content_hash=excluded.last_content_hash,
    updated_at=CURRENT_TIMESTAMP;
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0033','icai phase2 durable incremental watermarks','phase-12-operations-admin-platform');
'''
(ROOT / "d1/migrations/0033_icai_phase2_incremental_watermarks.sql").write_text(migration)

verifier = r'''import { execFileSync } from "node:child_process";
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
'''
(ROOT / "scripts/verify-icai-phase2-live.mjs").write_text(verifier)

test_file = r'''import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 2 persists a durable successful-only per-source watermark", () => {
  const migration = read("d1/migrations/0033_icai_phase2_incremental_watermarks.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS icai_source_watermarks/);
  assert.match(migration, /source_id TEXT PRIMARY KEY REFERENCES icai_sources\(id\) ON DELETE CASCADE/);
  assert.match(migration, /bootstrap_complete INTEGER NOT NULL/);
  assert.match(migration, /published_high_watermark TEXT/);
  assert.match(migration, /attempt_high_watermark TEXT/);
  assert.match(migration, /AFTER UPDATE OF last_success_at ON icai_sources/);
  assert.match(migration, /icai_source_watermark_after_success/);
  assert.match(migration, /VALUES \('0033'/);
});

test("Phase 2 uses the durable lock while preserving the Phase 1 compatibility flag", () => {
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(engine, /SELECT bootstrap_complete,bootstrap_completed_at,last_success_at,published_high_watermark,attempt_high_watermark FROM icai_source_watermarks/);
  assert.match(engine, /policySource/);
  assert.match(engine, /bootstrap_complete: true/);
  assert.match(engine, /completedAdapterConfig/);
});

test("Phase 2 resource identity survives a changed direct ICAI PDF URL", () => {
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(engine, /resourceSemanticKey/);
  assert.match(engine, /existingByUrl\.get\(item\.officialUrl\)/);
  assert.match(engine, /existingBySemantic\.get\(semanticKey\)/);
  assert.match(engine, /sha256Hex\(semanticKey\)/);
  assert.doesNotMatch(engine, /sha256Hex\(`\$\{source\.id\}:\$\{item\.officialUrl\}`\)/);
  assert.match(engine, /semantic_key: semanticKey/);
});

test("Phase 2 retained migration and clean-D1 validator cover migration 0033", () => {
  const retained = read("scripts/apply-retained-d1-migrations.mjs");
  const validator = read("scripts/validate-d1-hot-indexes.mjs");
  assert.match(retained, /\["0033", "d1\/migrations\/0033_icai_phase2_incremental_watermarks\.sql"\]/);
  assert.match(retained, /BETWEEN '0012' AND '0033'/);
  assert.match(validator, /0033_icai_phase2_incremental_watermarks\.sql/);
  assert.match(validator, /icai_source_watermarks/);
  assert.match(validator, /icai_source_watermark_after_success/);
});

test("Phase 2 deployment proves a second real Queue sync is idempotent", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
  const verifier = read("scripts/verify-icai-phase2-live.mjs");
  assert.match(workflow, /ICAI Phase 2 incremental idempotency proof/);
  assert.match(workflow, /verify-icai-phase2-live\.mjs/);
  assert.match(verifier, /icai-phase5-real-run\.json/);
  assert.match(verifier, /Phase 2 repeat sync was not idempotent/);
  assert.match(verifier, /repeatRun\.new_items/);
  assert.match(verifier, /bootstrap_completed_at !== before\.bootstrap_completed_at/);
  assert.match(verifier, /PRAGMA foreign_key_check/);
});
'''
(ROOT / "tests/icai-incremental-phase2.test.mjs").write_text(test_file)

# Make the durable watermark authoritative for bootstrap lock state and replace
# URL-derived resource IDs with a backward-compatible semantic identity lookup.
sync_path = ROOT / "workers/icai-sync/sync-engine.ts"
sync = sync_path.read_text()
resource_pattern = r'''async function resourcePayload\(\n  source: IcaiSourceConfig,\n  item: ParsedIcaiResource,\n  attemptIdsByIdentity: Map<string, string>,\n\) \{.*?\n\}\n\nasync function processSource\('''
resource_replacement = r'''type ExistingResourceIdentityRow = {
  id: string;
  resource_type: string;
  title: string;
  official_url: string;
  metadata: unknown;
  subject_ids: string | null;
};

type SourceWatermarkRow = {
  bootstrap_complete: number | boolean;
  bootstrap_completed_at: string | null;
  last_success_at: string | null;
  published_high_watermark: string | null;
  attempt_high_watermark: string | null;
};

function metadataObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function resourceSemanticKey(
  sourceId: string,
  resourceType: string,
  title: string,
  levelCodes: string[],
  subjectIds: string[],
) {
  const levels = [...new Set(levelCodes)].sort().join(",");
  const subjects = [...new Set(subjectIds)].sort().join(",");
  return ["v1", sourceId, resourceType, title.trim().toLowerCase(), levels, subjects].join("|");
}

async function existingResourceIdentityMaps(
  runtime: IcaiSyncRuntime,
  source: IcaiSourceConfig,
) {
  const result = await runtime.db
    .prepare(
      "SELECT r.id,r.resource_type,r.title,r.official_url,r.metadata,COALESCE(group_concat(m.subject_id, char(31)),'') AS subject_ids FROM icai_resources r LEFT JOIN resource_subject_map m ON m.resource_id=r.id WHERE r.source_id=?1 GROUP BY r.id,r.resource_type,r.title,r.official_url,r.metadata",
    )
    .bind(source.id)
    .all<ExistingResourceIdentityRow>();
  const existingByUrl = new Map<string, string>();
  const existingBySemantic = new Map<string, string>();
  for (const row of result.results ?? []) {
    existingByUrl.set(row.official_url, row.id);
    const metadata = metadataObject(row.metadata);
    const levelCodes = Array.isArray(metadata.level_codes)
      ? metadata.level_codes.filter((value): value is string => typeof value === "string")
      : [];
    const subjectIds = String(row.subject_ids ?? "")
      .split(String.fromCharCode(31))
      .filter(Boolean);
    const key = resourceSemanticKey(
      source.id,
      row.resource_type,
      row.title,
      levelCodes,
      subjectIds,
    );
    const previous = existingBySemantic.get(key);
    if (previous && previous !== row.id)
      throw new Error(`Ambiguous ICAI semantic resource identity for ${source.id}: ${row.title}`);
    existingBySemantic.set(key, row.id);
  }
  return { existingByUrl, existingBySemantic };
}

async function resourcePayload(
  source: IcaiSourceConfig,
  item: ParsedIcaiResource,
  attemptIdsByIdentity: Map<string, string>,
  existingByUrl: Map<string, string>,
  existingBySemantic: Map<string, string>,
) {
  const semanticKey = resourceSemanticKey(
    source.id,
    item.resourceType,
    item.title,
    item.levelCodes,
    item.subjectIds,
  );
  const id =
    existingByUrl.get(item.officialUrl) ??
    existingBySemantic.get(semanticKey) ??
    `icai-resource-${(await sha256Hex(semanticKey)).slice(0, 32)}`;
  const attemptIds = item.attemptKeys
    .flatMap((key) =>
      item.levelCodes.map((level) =>
        attemptIdsByIdentity.get(`${level}:${key}`),
      ),
    )
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.indexOf(value) === index);
  const canonical = {
    type: item.resourceType,
    title: item.title,
    officialUrl: item.officialUrl,
    publishedOn: item.publishedOn,
    levelCodes: item.levelCodes.slice().sort(),
    attemptIds: attemptIds.slice().sort(),
    subjectIds: item.subjectIds.slice().sort(),
  };
  return {
    id,
    resource_type: item.resourceType,
    title: item.title,
    summary: item.summary ?? "",
    official_url: item.officialUrl,
    published_on: item.publishedOn ?? "",
    content_hash: await sha256Hex(stableJson(canonical)),
    parser_version: PARSER_VERSION,
    attempt_ids: attemptIds,
    subject_ids: item.subjectIds,
    metadata: {
      level_codes: item.levelCodes,
      attempt_keys: item.attemptKeys,
      semantic_key: semanticKey,
    },
  };
}

async function processSource('''
sync, count = re.subn(resource_pattern, resource_replacement, sync, count=1, flags=re.S)
if count != 1:
    raise RuntimeError(f"Could not replace resourcePayload block ({count})")

old_window = '''  const windowed = applyIcaiWindowPolicy(direct.payload, source);\n  const parsed = windowed.payload;'''
new_window = '''  const watermark = await runtime.db\n    .prepare(\n      "SELECT bootstrap_complete,bootstrap_completed_at,last_success_at,published_high_watermark,attempt_high_watermark FROM icai_source_watermarks WHERE source_id=?1 LIMIT 1",\n    )\n    .bind(source.id)\n    .first<SourceWatermarkRow>();\n  const policySource = watermark?.bootstrap_complete\n    ? {\n        ...source,\n        adapterConfig: {\n          ...source.adapterConfig,\n          bootstrap_complete: true,\n          bootstrap_completed_at:\n            watermark.bootstrap_completed_at ??\n            source.adapterConfig.bootstrap_completed_at,\n        },\n      }\n    : source;\n  const windowed = applyIcaiWindowPolicy(direct.payload, policySource);\n  const parsed = windowed.payload;'''
if sync.count(old_window) != 1:
    raise RuntimeError(f"Could not locate window policy call ({sync.count(old_window)})")
sync = sync.replace(old_window, new_window, 1)

old_resources = '''  const resourcePayloads = await Promise.all(\n    parsed.resources.map((resource) =>\n      resourcePayload(source, resource, attemptIdsByIdentity),\n    ),\n  );'''
new_resources = '''  const { existingByUrl, existingBySemantic } =\n    await existingResourceIdentityMaps(runtime, source);\n  const resourcePayloads = await Promise.all(\n    parsed.resources.map((resource) =>\n      resourcePayload(\n        source,\n        resource,\n        attemptIdsByIdentity,\n        existingByUrl,\n        existingBySemantic,\n      ),\n    ),\n  );'''
if sync.count(old_resources) != 1:
    raise RuntimeError(f"Could not locate resource payload map ({sync.count(old_resources)})")
sync = sync.replace(old_resources, new_resources, 1)
sync_path.write_text(sync)

replace_once(
    "scripts/apply-retained-d1-migrations.mjs",
    '  ["0032", "d1/migrations/0032_icai_resource_mapping_integrity.sql"],\n];',
    '  ["0032", "d1/migrations/0032_icai_resource_mapping_integrity.sql"],\n  ["0033", "d1/migrations/0033_icai_phase2_incremental_watermarks.sql"],\n];',
)
replace_once(
    "scripts/apply-retained-d1-migrations.mjs",
    "BETWEEN '0012' AND '0032'",
    "BETWEEN '0012' AND '0033'",
)

replace_once(
    "scripts/validate-d1-hot-indexes.mjs",
    '    ["0031", "0031_icai_phase1_exact_source_scope.sql"],\n  ]) {',
    '    ["0031", "0031_icai_phase1_exact_source_scope.sql"],\n    ["0032", "0032_icai_resource_mapping_integrity.sql"],\n    ["0033", "0033_icai_phase2_incremental_watermarks.sql"],\n  ]) {',
)
validator_marker = '  const auditTables = execute("SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'icai_review_decisions\';");'
validator_insert = '''  const watermarkTables = execute("SELECT name FROM sqlite_master WHERE type='table' AND name='icai_source_watermarks';");\n  assert(watermarkTables.length === 1, "ICAI Phase 2 watermark table is missing");\n  const watermarkTriggers = execute("SELECT name FROM sqlite_master WHERE type='trigger' AND name='icai_source_watermark_after_success';");\n  assert(watermarkTriggers.length === 1, "ICAI Phase 2 successful-only watermark trigger is missing");\n  const freshWatermarks = execute("SELECT source_id,bootstrap_complete FROM icai_source_watermarks ORDER BY source_id;");\n  assert(freshWatermarks.length === 6, "ICAI Phase 2 fresh D1 did not seed one watermark per active source");\n  assert(freshWatermarks.every((row) => Number(row.bootstrap_complete) === 0), "Fresh D1 must remain bootstrap-unlocked until a successful source run");\n\n'''
replace_once("scripts/validate-d1-hot-indexes.mjs", validator_marker, validator_insert + validator_marker)

phase2_step = '''      - name: ICAI Phase 2 incremental idempotency proof\n        shell: bash\n        run: |\n          set +e\n          node scripts/verify-icai-phase2-live.mjs\n          result=$?\n          if [ "$result" -ne 0 ]; then\n            npx wrangler rollback --name ca-progress-v2-icai-sync --message "Automated rollback after failed ICAI Phase 2 incremental proof" || true\n            npx wrangler rollback --name ca-progress-v2 --message "Automated rollback after failed ICAI Phase 2 incremental proof" || true\n            exit "$result"\n          fi\n\n'''
replace_once(
    ".github/workflows/deploy-staging.yml",
    "      - name: Verify deployment and rollback web runtime on failure\n",
    phase2_step + "      - name: Verify deployment and rollback web runtime on failure\n",
)
replace_once(
    ".github/workflows/deploy-staging.yml",
    "SELECT COUNT(*) AS icai_review_decisions FROM icai_review_decisions;\" > deployment-evidence/d1-after.txt",
    "SELECT COUNT(*) AS icai_review_decisions FROM icai_review_decisions; SELECT COUNT(*) AS icai_phase2_watermarks FROM icai_source_watermarks WHERE bootstrap_complete=1;\" > deployment-evidence/d1-after.txt",
)

replace_once(
    "package.json",
    'tests/icai-continuation-deploy-order.test.mjs tests/icai-bootstrap-current-window.test.mjs\"',
    'tests/icai-continuation-deploy-order.test.mjs tests/icai-bootstrap-current-window.test.mjs tests/icai-incremental-phase2.test.mjs\"',
)

# The reconstruction helper/workflow are staging-only and must not enter the
# clean tree that will be transplanted onto the production branch.
(ROOT / "scripts/__phase2_reconstruct.py").unlink(missing_ok=True)
(ROOT / ".github/workflows/__phase2-reconstruct.yml").unlink(missing_ok=True)
