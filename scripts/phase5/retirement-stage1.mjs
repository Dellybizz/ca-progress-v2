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
    "Supabase source remained frozen across final delta",
    Boolean(beforeDigest) && beforeDigest === afterDigest && input?.sourceStability?.stable === true,
    `before=${beforeDigest || "missing"}; after=${afterDigest || "missing"}`,
  ));

  const reconciliation = input?.reconciliation ?? {};
  const failures = Array.isArray(reconciliation.failures) ? reconciliation.failures.length : Number.POSITIVE_INFINITY;
  const discrepancies = Array.isArray(reconciliation.discrepancies) ? reconciliation.discrepancies.length : Number.POSITIVE_INFINITY;
  const reconciliationFk = Number(reconciliation.foreignKeyViolations ?? Number.NaN);
  checks.push(check(
    "Final source to D1 reconciliation is clean",
    reconciliation.status === "reconciled" && failures === 0 && discrepancies === 0 && reconciliationFk === 0,
    `status=${reconciliation.status ?? "missing"}; failures=${failures}; discrepancies=${discrepancies}; foreignKeyViolations=${reconciliationFk}`,
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

  const candidate = firstDeployment(input?.deployments);
  const candidateId = deploymentId(candidate);
  checks.push(check(
    "Production Worker rollback candidate recorded",
    Boolean(candidateId),
    candidateId ? `deployment=${candidateId}` : "deployment id/version missing",
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
    "Final logical backup manifest is present",
    typeof backup.sha256 === "string" && /^[a-f0-9]{64}$/.test(backup.sha256) && Number(backup.authUserCount) > 0,
    `sha256=${backup.sha256 ?? "missing"}; authUsers=${backup.authUserCount ?? "missing"}; records=${backup.publicRecordCount ?? "missing"}; storageObjects=${backup.storageObjectCount ?? "missing"}`,
  ));

  const durable = input?.durable ?? {};
  checks.push(check(
    "Final backup is durably preserved in private R2",
    durable.verified === true && typeof durable.bucket === "string" && durable.bucket.length > 0 && typeof durable.objectKey === "string" && durable.objectKey.length > 0 && /^[a-f0-9]{64}$/.test(String(durable.archiveSha256 ?? "")),
    `bucket=${durable.bucket || "missing"}; object=${durable.objectKey || "missing"}; verified=${durable.verified === true}`,
  ));

  checks.push(check(
    "Destructive Supabase operations remain frozen",
    input?.destructiveSupabaseActionsPerformed === false,
    "Stage 1 performs read-only Supabase source access only; project deletion/key revocation is deferred to Stage 5.",
  ));

  return {
    checks,
    rollbackCandidate: candidateId ? {
      deploymentId: candidateId,
      createdOn: candidate?.created_on ?? candidate?.createdAt ?? candidate?.created_at ?? null,
      source: candidate?.source ?? null,
    } : null,
    secretNames: uniqueSecretNames,
    bindingNames,
  };
}

function markdown(report) {
  return `# Supabase Retirement — Stage 1 Baseline\n\n- Status: **${report.status}**\n- Branch: \`${report.branch}\`\n- Commit: \`${report.commit}\`\n- Workflow run: \`${report.workflowRun}\`\n- Rollback Worker deployment: \`${report.rollbackCandidate?.deploymentId ?? "missing"}\`\n- Durable backup: \`r2://${report.durable.bucket}/${report.durable.objectKey}\`\n- Durable archive SHA-256: \`${report.durable.archiveSha256}\`\n- Final logical export SHA-256: \`${report.backup.sha256}\`\n\n| Check | Status | Evidence |\n|---|---|---|\n${report.checks.map((item) => `| ${item.name} | ${item.status} | ${item.evidence.replaceAll("|", "\\|")} |`).join("\n")}\n`;
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function runStage1({
  root = process.env.RETIREMENT_STAGE1_DIR || "retirement-stage1",
  outputDir = process.env.RETIREMENT_STAGE1_OUTPUT || "retirement-stage1/report",
} = {}) {
  const [sourceStability, reconciliation, d1Health, deployments, secretNames, bindings, backup] = await Promise.all([
    json(`${root}/evidence/source-stability.json`),
    json(`${root}/evidence/phase4-report.json`),
    json(`${root}/evidence/d1-health.json`),
    json(`${root}/evidence/worker-deployments.json`),
    json(`${root}/evidence/worker-secret-names-only.json`),
    json(`${root}/evidence/binding-snapshot.json`),
    json(`${root}/source-after/manifest.json`),
  ]);

  const durable = {
    verified: process.env.RETIREMENT_STAGE1_DURABLE_VERIFIED === "1",
    bucket: process.env.RETIREMENT_STAGE1_DURABLE_BUCKET || "",
    objectKey: process.env.RETIREMENT_STAGE1_DURABLE_OBJECT || "",
    archiveSha256: process.env.RETIREMENT_STAGE1_ARCHIVE_SHA256 || "",
  };
  const evaluated = evaluateStage1({
    sourceStability,
    reconciliation,
    d1Health,
    deployments,
    secretNames,
    bindings,
    backup,
    durable,
    destructiveSupabaseActionsPerformed: false,
  });
  const failed = evaluated.checks.filter((item) => item.status !== "passed");
  const report = {
    schemaVersion: 1,
    phase: "supabase-retirement-stage-1",
    generatedAt: new Date().toISOString(),
    status: failed.length ? "failed" : "passed",
    branch: process.env.GITHUB_REF_NAME || "local",
    commit: process.env.GITHUB_SHA || "local",
    workflowRun: process.env.GITHUB_RUN_ID || "local",
    sourceStability,
    reconciliation: {
      status: reconciliation.status ?? null,
      failures: Array.isArray(reconciliation.failures) ? reconciliation.failures.length : null,
      discrepancies: Array.isArray(reconciliation.discrepancies) ? reconciliation.discrepancies.length : null,
      foreignKeyViolations: reconciliation.foreignKeyViolations ?? null,
    },
    d1Health,
    rollbackCandidate: evaluated.rollbackCandidate,
    secretNames: evaluated.secretNames,
    bindingNames: evaluated.bindingNames,
    backup: {
      sha256: backup.sha256,
      createdAt: backup.createdAt,
      authUserCount: backup.authUserCount,
      publicRecordCount: backup.publicRecordCount,
      storageObjectCount: backup.storageObjectCount,
    },
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
