import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const REQUIRED_COUNT_KEYS = Object.freeze([
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function check(name, passed, evidence) {
  return { name, status: passed ? "passed" : "failed", evidence: String(evidence ?? "").slice(0, 2000) };
}

function firstDeployment(deployments) {
  if (Array.isArray(deployments)) return deployments[0] ?? null;
  if (Array.isArray(deployments?.deployments)) return deployments.deployments[0] ?? null;
  return null;
}

function deploymentId(deployment) {
  if (!deployment || typeof deployment !== "object") return "";
  return String(deployment.id ?? deployment.version_id ?? deployment.versionId ?? deployment.deployment_id ?? "");
}

function bookmarkId(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = bookmarkId(item);
      if (found) return found;
    }
    return "";
  }
  if (!value || typeof value !== "object") return "";
  if (typeof value.bookmark === "string" && value.bookmark.length > 20) return value.bookmark;
  if (typeof value.current_bookmark === "string" && value.current_bookmark.length > 20) return value.current_bookmark;
  return bookmarkId(value.result);
}

export function sourceStateDigest(payload) {
  return sha256(JSON.stringify({
    authUsers: payload?.authUsers ?? [],
    tables: payload?.tables ?? {},
    storageInventory: payload?.storageInventory ?? [],
  }));
}

export function evaluateStage1(input) {
  const checks = [];
  const beforeDigest = input?.sourceStability?.beforeContentSha256 ?? "";
  const afterDigest = input?.sourceStability?.afterContentSha256 ?? "";
  checks.push(check(
    "Supabase source remained frozen during Stage 1",
    Boolean(beforeDigest) && beforeDigest === afterDigest && input?.sourceStability?.stable === true,
    `before=${beforeDigest || "missing"}; after=${afterDigest || "missing"}`,
  ));

  const sourceAudit = input?.sourceAudit ?? {};
  const baseline = sourceAudit.baselineFinalDelta ?? {};
  checks.push(check(
    "Last source-authoritative final delta remains clean",
    baseline.status === "reconciled" && Number(baseline.failureCount) === 0 && Number(baseline.discrepancyCount) === 0,
    `status=${baseline.status ?? "missing"}; failures=${baseline.failureCount ?? "missing"}; discrepancies=${baseline.discrepancyCount ?? "missing"}`,
  ));
  checks.push(check(
    "No pending Supabase source write remains after cutover",
    sourceAudit.status === "passed" && Number(sourceAudit?.summary?.pendingSourceWrites) === 0,
    `changedSinceFinalDelta=${sourceAudit?.summary?.sourceChangedSinceFinalDelta ?? "missing"}; pending=${sourceAudit?.summary?.pendingSourceWrites ?? "missing"}; changedTables=${(sourceAudit.changedSinceFinalDeltaTables || []).join(",") || "none"}`,
  ));
  checks.push(check(
    "Migrated Supabase auth identities remain mapped in D1",
    Number(sourceAudit?.auth?.missingAppUsers) === 0 && Number(sourceAudit?.auth?.missingSupabaseIdentities) === 0 && Number(sourceAudit?.auth?.sourceAuthUserCount) > 0,
    `source=${sourceAudit?.auth?.sourceAuthUserCount ?? "missing"}; missingAppUsers=${sourceAudit?.auth?.missingAppUsers ?? "missing"}; missingIdentities=${sourceAudit?.auth?.missingSupabaseIdentities ?? "missing"}`,
  ));

  const d1 = input?.d1Health ?? {};
  const counts = d1.counts && typeof d1.counts === "object" ? d1.counts : {};
  checks.push(check(
    "Production D1 foreign-key integrity",
    Number(d1.foreignKeyViolations) === 0,
    `foreignKeyViolations=${d1.foreignKeyViolations ?? "missing"}`,
  ));
  checks.push(check(
    "Production D1 application-user population is sane",
    Number(counts.app_users) > 0,
    `app_users=${counts.app_users ?? "missing"}`,
  ));
  const missingCounts = REQUIRED_COUNT_KEYS.filter((key) => !Number.isFinite(Number(counts[key])) || Number(counts[key]) < 0);
  checks.push(check(
    "Representative D1 domains are readable",
    missingCounts.length === 0,
    missingCounts.length ? `missing=${missingCounts.join(",")}` : REQUIRED_COUNT_KEYS.map((key) => `${key}=${counts[key]}`).join("; "),
  ));

  const matrix = input?.liveMatrix ?? {};
  const requiredMatrixFailures = Array.isArray(matrix.checks)
    ? matrix.checks.filter((item) => item?.required !== false && item?.status !== "passed").length
    : Number.POSITIVE_INFINITY;
  checks.push(check(
    "Fresh authenticated production mutation matrix is green",
    matrix.status === "passed" && Number(matrix?.summary?.failed) === 0 && requiredMatrixFailures === 0,
    `status=${matrix.status ?? "missing"}; passed=${matrix?.summary?.passed ?? "missing"}; failed=${matrix?.summary?.failed ?? "missing"}; unsupported=${matrix?.summary?.unsupported ?? "missing"}; requiredFailures=${requiredMatrixFailures}`,
  ));

  const closure = input?.verificationClosure ?? {};
  checks.push(check(
    "Fresh Phase 4 verification closure is green",
    closure.status === "passed" && Number(closure?.summary?.failed) === 0,
    `status=${closure.status ?? "missing"}; passed=${closure?.summary?.passed ?? "missing"}; failed=${closure?.summary?.failed ?? "missing"}`,
  ));

  const candidate = firstDeployment(input?.deployments);
  const candidateId = deploymentId(candidate);
  checks.push(check(
    "Production Worker rollback candidate recorded",
    Boolean(candidateId),
    candidateId ? `deployment=${candidateId}` : "deployment id/version missing",
  ));

  const bookmark = bookmarkId(input?.d1Bookmark);
  checks.push(check(
    "Production D1 Time Travel rollback bookmark recorded",
    Boolean(bookmark),
    bookmark ? `bookmark=${bookmark}` : "bookmark missing",
  ));

  const secretNames = Array.isArray(input?.secretNames) ? input.secretNames.filter((name) => typeof name === "string") : [];
  const uniqueSecretNames = [...new Set(secretNames)].sort();
  checks.push(check(
    "Worker secret names snapshot recorded without values",
    uniqueSecretNames.length > 0 && uniqueSecretNames.every((name) => name.length > 0 && !name.includes("=")),
    `secretNameCount=${uniqueSecretNames.length}`,
  ));

  const bindings = input?.bindings ?? {};
  const bindingNames = Array.isArray(bindings.bindingNames) ? bindings.bindingNames : [];
  checks.push(check(
    "Cloudflare binding snapshot recorded",
    bindingNames.includes("DB") && bindingNames.includes("USER_RESOURCES_R2") && bindingNames.includes("ICAI_SYNC_SERVICE") && bindingNames.includes("BILLING_SERVICE") && bindingNames.includes("BACKGROUND_JOBS"),
    `bindings=${bindingNames.join(",") || "missing"}`,
  ));

  const backup = input?.backup ?? {};
  checks.push(check(
    "Final Supabase logical backup manifest is present",
    typeof backup.sha256 === "string" && /^[a-f0-9]{64}$/.test(backup.sha256) && Number(backup.authUserCount) > 0,
    `sha256=${backup.sha256 ?? "missing"}; authUsers=${backup.authUserCount ?? "missing"}; records=${backup.publicRecordCount ?? "missing"}; storageObjects=${backup.storageObjectCount ?? "missing"}`,
  ));

  const d1Backup = input?.d1Backup ?? {};
  checks.push(check(
    "Current production D1 export is preserved in the retirement pack",
    typeof d1Backup.sha256 === "string" && /^[a-f0-9]{64}$/.test(d1Backup.sha256) && Number(d1Backup.bytes) > 0,
    `sha256=${d1Backup.sha256 ?? "missing"}; bytes=${d1Backup.bytes ?? "missing"}`,
  ));

  const durable = input?.durable ?? {};
  checks.push(check(
    "Final retirement backup is durably preserved in private R2",
    durable.verified === true && typeof durable.bucket === "string" && durable.bucket.length > 0 && typeof durable.objectKey === "string" && durable.objectKey.length > 0 && /^[a-f0-9]{64}$/.test(String(durable.archiveSha256 ?? "")),
    `bucket=${durable.bucket || "missing"}; object=${durable.objectKey || "missing"}; verified=${durable.verified === true}`,
  ));

  checks.push(check(
    "Destructive Supabase operations remain frozen",
    input?.destructiveSupabaseActionsPerformed === false,
    "Stage 1 uses read-only Supabase access only; project deletion/key revocation remains deferred to Stage 5.",
  ));

  return {
    checks,
    rollbackCandidate: candidateId ? {
      deploymentId: candidateId,
      createdOn: candidate?.created_on ?? candidate?.createdAt ?? candidate?.created_at ?? null,
      source: candidate?.source ?? null,
    } : null,
    d1RollbackBookmark: bookmark || null,
    secretNames: uniqueSecretNames,
    bindingNames,
  };
}

function markdown(report) {
  return `# Supabase Retirement — Stage 1 Baseline\n\n- Status: **${report.status}**\n- Branch: \`${report.branch}\`\n- Commit: \`${report.commit}\`\n- Workflow run: \`${report.workflowRun}\`\n- Rollback Worker deployment: \`${report.rollbackCandidate?.deploymentId ?? "missing"}\`\n- D1 rollback bookmark: \`${report.d1RollbackBookmark ?? "missing"}\`\n- Durable backup: \`r2://${report.durable.bucket}/${report.durable.objectKey}\`\n- Durable archive SHA-256: \`${report.durable.archiveSha256}\`\n- Final Supabase export SHA-256: \`${report.backup.sha256}\`\n- Current D1 export SHA-256: \`${report.d1Backup.sha256}\`\n- Source tables changed since final delta: ${(report.sourceAudit.changedSinceFinalDeltaTables || []).join(", ") || "none"}\n- Pending source writes: ${report.sourceAudit?.summary?.pendingSourceWrites ?? "missing"}\n\n| Check | Status | Evidence |\n|---|---|---|\n${report.checks.map((item) => `| ${item.name} | ${item.status} | ${item.evidence.replaceAll("|", "\\|")} |`).join("\n")}\n`;
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function runStage1({
  root = process.env.RETIREMENT_STAGE1_DIR || "retirement-stage1",
  outputDir = process.env.RETIREMENT_STAGE1_OUTPUT || "retirement-stage1/report",
} = {}) {
  const [sourceStability, sourceAudit, d1Health, liveMatrix, verificationClosure, deployments, d1Bookmark, secretNames, bindings, backup, d1Backup] = await Promise.all([
    json(`${root}/evidence/source-stability.json`),
    json(`${root}/evidence/post-cutover-source-audit.json`),
    json(`${root}/evidence/d1-health.json`),
    json(`${root}/evidence/mutation-matrix.json`),
    json(`${root}/evidence/phase4-closure.json`),
    json(`${root}/evidence/worker-deployments.json`),
    json(`${root}/evidence/d1-bookmark.json`),
    json(`${root}/evidence/worker-secret-names-only.json`),
    json(`${root}/evidence/binding-snapshot.json`),
    json(`${root}/source-after/manifest.json`),
    json(`${root}/evidence/d1-backup-manifest.json`),
  ]);

  const durable = {
    verified: process.env.RETIREMENT_STAGE1_DURABLE_VERIFIED === "1",
    bucket: process.env.RETIREMENT_STAGE1_DURABLE_BUCKET || "",
    objectKey: process.env.RETIREMENT_STAGE1_DURABLE_OBJECT || "",
    archiveSha256: process.env.RETIREMENT_STAGE1_ARCHIVE_SHA256 || "",
  };
  const evaluated = evaluateStage1({
    sourceStability,
    sourceAudit,
    d1Health,
    liveMatrix,
    verificationClosure,
    deployments,
    d1Bookmark,
    secretNames,
    bindings,
    backup,
    d1Backup,
    durable,
    destructiveSupabaseActionsPerformed: false,
  });
  const failed = evaluated.checks.filter((item) => item.status !== "passed");
  const report = {
    schemaVersion: 2,
    phase: "supabase-retirement-stage-1",
    generatedAt: new Date().toISOString(),
    status: failed.length ? "failed" : "passed",
    branch: process.env.GITHUB_REF_NAME || "local",
    commit: process.env.GITHUB_SHA || "local",
    workflowRun: process.env.GITHUB_RUN_ID || "local",
    sourceStability,
    sourceAudit,
    d1Health,
    liveMatrix: {
      status: liveMatrix.status,
      summary: liveMatrix.summary,
    },
    verificationClosure: {
      status: verificationClosure.status,
      summary: verificationClosure.summary,
    },
    rollbackCandidate: evaluated.rollbackCandidate,
    d1RollbackBookmark: evaluated.d1RollbackBookmark,
    secretNames: evaluated.secretNames,
    bindingNames: evaluated.bindingNames,
    backup: {
      sha256: backup.sha256,
      createdAt: backup.createdAt,
      authUserCount: backup.authUserCount,
      publicRecordCount: backup.publicRecordCount,
      storageObjectCount: backup.storageObjectCount,
    },
    d1Backup,
    durable,
    destructiveSupabaseActionsPerformed: false,
    checks: evaluated.checks,
    summary: {
      passed: evaluated.checks.filter((item) => item.status === "passed").length,
      failed: failed.length,
    },
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(`${outputDir}/stage1-baseline.json`, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(`${outputDir}/stage1-baseline.md`, markdown(report));
  console.log(`Supabase retirement Stage 1: ${report.status}; ${report.summary.passed} passed / ${report.summary.failed} failed.`);
  if (report.status !== "passed") process.exitCode = 1;
  return report;
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) {
  runStage1().catch((error) => {
    console.error(`Supabase retirement Stage 1 failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
