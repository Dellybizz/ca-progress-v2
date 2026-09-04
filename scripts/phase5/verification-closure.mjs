import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { sqlLiteral } from "./phase2-fixture-helpers.mjs";

export const KNOWN_NON_REQUIRED_UNSUPPORTED = Object.freeze([
  "community message edit capability",
]);

export const REQUIRED_CLOSURE_EVIDENCE = Object.freeze([
  "dynamic academic/community fixture",
  "community guest create rejected without D1 mutation",
  "community create D1 evidence",
  "community student moderation rejected without D1 mutation",
  "community moderation audit evidence",
  "note create D1 evidence",
  "note ownership protection",
  "note moderation D1 evidence",
  "note delete D1 evidence",
  "resource signed upload intent",
  "resource direct signed R2 PUT",
  "resource upload complete",
  "resource metadata D1 evidence",
  "resource ownership protection",
  "resource moderation D1 evidence",
  "resource shared access",
  "resource delete",
  "resource delete D1 evidence",
  "planner invalid academic scope rejected without D1 mutation",
  "planner task ownership protection",
  "planner task delete D1 evidence",
  "planner goal D1 evidence",
  "planner calendar D1 evidence",
  "progress invalid chapter rejected without D1 mutation",
  "progress guest mutation rejected",
  "progress completed D1 evidence",
  "progress revision_1 D1 evidence",
  "progress revision_2 D1 evidence",
  "progress test_1 D1 evidence",
  "progress test_2 D1 evidence",
  "progress clear D1 evidence",
  "progress undo D1 evidence",
  "progress history evidence",
  "guaranteed exact-ID cleanup",
  "state restoration",
  "progress current-state post-cleanup verification",
  "report privacy scan",
]);

export const MARKER_RESIDUE_TABLES = Object.freeze([
  "community_messages",
  "message_reports",
  "moderation_actions",
  "notes",
  "resource_moderation",
  "r2_upload_intents",
  "uploaded_resources",
  "tasks",
  "goals",
  "user_calendar_events",
]);

const SECRET_NAMES = Object.freeze([
  "SMOKE_MUTATION_AUTH_COOKIE",
  "SMOKE_MODERATOR_AUTH_COOKIE",
  "CLOUDFLARE_API_TOKEN",
]);

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe D1 identifier: ${value}`);
  }
  return `"${value}"`;
}

function redact(value) {
  let text = String(value ?? "");
  for (const name of SECRET_NAMES) {
    const secret = String(process.env[name] ?? "");
    if (secret.length >= 4) text = text.split(secret).join("[redacted-secret]");
  }
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/([?&](?:code|token|key|secret)=)[^&\s]+/gi, "$1[redacted]")
    .slice(0, 2400);
}

function result(name, passed, evidence) {
  return {
    name,
    status: passed ? "passed" : "failed",
    required: true,
    evidence: redact(evidence),
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function evaluatePhase3Report(report, context = {}) {
  const checks = [];
  const phaseChecks = Array.isArray(report?.checks) ? report.checks : [];
  const byName = new Map(phaseChecks.map((check) => [check?.name, check]));

  checks.push(result(
    "phase 3 report schema",
    isObject(report) && report.schemaVersion === 1 && report.phase === "phase-3-mutation-auth-matrix" && Array.isArray(report.checks),
    `schemaVersion=${report?.schemaVersion ?? "missing"}; phase=${report?.phase ?? "missing"}; checks=${phaseChecks.length}`,
  ));

  const computed = {
    passed: phaseChecks.filter((check) => check?.status === "passed").length,
    failed: phaseChecks.filter((check) => check?.status === "failed").length,
    unsupported: phaseChecks.filter((check) => check?.status === "unsupported").length,
  };
  const summaryMatches =
    Number(report?.summary?.passed) === computed.passed &&
    Number(report?.summary?.failed) === computed.failed &&
    Number(report?.summary?.unsupported) === computed.unsupported;
  checks.push(result(
    "phase 3 summary reconciliation",
    summaryMatches,
    `declared=${JSON.stringify(report?.summary ?? null)}; computed=${JSON.stringify(computed)}`,
  ));

  const requiredFailures = phaseChecks.filter((check) => check?.required !== false && check?.status !== "passed");
  checks.push(result(
    "phase 3 required checks all passed",
    report?.status === "passed" && requiredFailures.length === 0 && computed.failed === 0,
    `status=${report?.status ?? "missing"}; requiredFailures=${requiredFailures.length}; failed=${computed.failed}`,
  ));

  const unsupported = phaseChecks.filter((check) => check?.status === "unsupported");
  const unexpectedUnsupported = unsupported.filter(
    (check) => check?.required !== false || !KNOWN_NON_REQUIRED_UNSUPPORTED.includes(check?.name),
  );
  const missingKnownUnsupported = KNOWN_NON_REQUIRED_UNSUPPORTED.filter(
    (name) => !unsupported.some((check) => check?.name === name && check?.required === false),
  );
  checks.push(result(
    "phase 3 unsupported capability allowlist",
    unexpectedUnsupported.length === 0 && missingKnownUnsupported.length === 0,
    `unsupported=${unsupported.map((check) => check?.name).join(",") || "none"}; unexpected=${unexpectedUnsupported.length}; missingKnown=${missingKnownUnsupported.length}`,
  ));

  const missingEvidence = REQUIRED_CLOSURE_EVIDENCE.filter((name) => byName.get(name)?.status !== "passed");
  checks.push(result(
    "phase 3 closure evidence coverage",
    missingEvidence.length === 0,
    missingEvidence.length ? `missingOrNotPassed=${missingEvidence.join(",")}` : `${REQUIRED_CLOSURE_EVIDENCE.length} required evidence checks passed`,
  ));

  const marker = String(report?.marker ?? "");
  checks.push(result(
    "phase 3 exact run marker",
    /^phase1-verification-[A-Za-z0-9._-]+$/.test(marker),
    marker ? `marker=${marker}` : "marker missing",
  ));

  if (context.expectedCommit) {
    checks.push(result(
      "phase 3 report commit matches closure commit",
      report?.commit === context.expectedCommit,
      `report=${report?.commit ?? "missing"}; closure=${context.expectedCommit}`,
    ));
  }
  if (context.expectedRun) {
    checks.push(result(
      "phase 3 report run matches closure run",
      String(report?.workflowRun ?? "") === String(context.expectedRun),
      `report=${report?.workflowRun ?? "missing"}; closure=${context.expectedRun}`,
    ));
  }
  if (context.expectedTarget) {
    checks.push(result(
      "phase 3 production target guard",
      report?.target === context.expectedTarget,
      `target=${report?.target ?? "missing"}`,
    ));
  }
  if (context.expectedDatabase) {
    checks.push(result(
      "phase 3 retained D1 guard",
      report?.database === context.expectedDatabase,
      `database=${report?.database ?? "missing"}`,
    ));
  }
  if (context.expectedBranch) {
    checks.push(result(
      "phase 4 branch guard",
      context.actualBranch === context.expectedBranch,
      `branch=${context.actualBranch || "missing"}; expected=${context.expectedBranch}`,
    ));
  }

  return checks;
}

function remoteD1(sql, database) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const response = spawnSync(
    command,
    ["wrangler", "d1", "execute", database, "--remote", "--json", "--config", "wrangler.web.jsonc", "--command", sql],
    {
      encoding: "utf8",
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (response.error || response.status !== 0) {
    throw new Error(redact(response.error?.message || response.stderr || `wrangler exited ${response.status}`));
  }
  const parsed = JSON.parse(response.stdout);
  const envelope = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!envelope?.success || !Array.isArray(envelope.results)) {
    throw new Error("Malformed remote D1 response.");
  }
  return envelope.results;
}

export function buildMarkerResidueQuery(table, columns, marker) {
  const safeTable = quoteIdentifier(table);
  const predicates = columns.map(
    (column) => `instr(COALESCE(CAST(${quoteIdentifier(column)} AS TEXT),''),${sqlLiteral(marker)})>0`,
  );
  if (!predicates.length) return `SELECT 0 AS n`;
  return `SELECT COUNT(*) AS n FROM ${safeTable} WHERE ${predicates.join(" OR ")}`;
}

async function runRemoteClosureChecks(report, database) {
  const checks = [];
  const foreignKeyRows = remoteD1("PRAGMA foreign_key_check", database);
  checks.push(result(
    "remote D1 foreign-key integrity",
    foreignKeyRows.length === 0,
    `violations=${foreignKeyRows.length}`,
  ));

  let residueTotal = 0;
  const residueDetails = [];
  for (const table of MARKER_RESIDUE_TABLES) {
    const columns = remoteD1(`PRAGMA table_info(${quoteIdentifier(table)})`, database)
      .map((column) => String(column.name || ""))
      .filter(Boolean);
    if (!columns.length) {
      checks.push(result(`remote D1 marker residue:${table}`, false, "table missing or has no columns"));
      continue;
    }
    const rows = remoteD1(buildMarkerResidueQuery(table, columns, report.marker), database);
    const count = Number(rows[0]?.n || 0);
    residueTotal += count;
    if (count) residueDetails.push(`${table}=${count}`);
    checks.push(result(
      `remote D1 marker residue:${table}`,
      count === 0,
      `rowsContainingCurrentRunMarker=${count}`,
    ));
  }
  checks.push(result(
    "remote D1 current-run residue total",
    residueTotal === 0,
    residueDetails.length ? residueDetails.join("; ") : "no current-run marker residue in touched mutable tables",
  ));
  return checks;
}

function markdown(report) {
  return `# Phase 4 verification closure

- Result: **${report.status}**
- Source Phase 3 run: \`${report.source.workflowRun}\`
- Commit: \`${report.commit}\`
- Branch: \`${report.branch}\`
- Target: \`${report.target}\`
- D1: \`${report.database}\`
- Source Phase 3: **${report.source.summary.passed} passed / ${report.source.summary.failed} failed / ${report.source.summary.unsupported} unsupported**

| Closure check | Status | Evidence |
|---|---|---|
${report.checks.map((check) => `| ${check.name} | ${check.status} | ${String(check.evidence).replaceAll("|", "\\|")} |`).join("\n")}
`;
}

async function fileDigest(path) {
  return digest(await readFile(path));
}

export async function runClosure({
  inputPath = process.env.PHASE4_SOURCE_REPORT || "phase3-report/mutation-matrix.json",
  inputMarkdownPath = "phase3-report/mutation-matrix.md",
  outputDirectory = "phase4-report",
  expectedCommit = process.env.GITHUB_SHA || "",
  expectedRun = process.env.GITHUB_RUN_ID || "",
  expectedBranch = process.env.PHASE4_EXPECTED_BRANCH || "phase-12-operations-admin-platform",
  actualBranch = process.env.GITHUB_REF_NAME || "",
  expectedTarget = (process.env.SMOKE_BASE_URL || "https://ca-progress-v2.habeebaasif622.workers.dev").replace(/\/$/, ""),
  expectedDatabase = process.env.PHASE3_D1_DATABASE || "ca-progress-v2-phase4-shadow",
  performRemoteChecks = process.env.PHASE4_SKIP_REMOTE_D1 !== "1",
} = {}) {
  await mkdir(outputDirectory, { recursive: true });
  const raw = await readFile(inputPath, "utf8");
  const source = JSON.parse(raw);
  const checks = evaluatePhase3Report(source, {
    expectedCommit,
    expectedRun,
    expectedBranch,
    actualBranch,
    expectedTarget,
    expectedDatabase,
  });

  if (performRemoteChecks) {
    try {
      checks.push(...await runRemoteClosureChecks(source, expectedDatabase));
    } catch (error) {
      checks.push(result(
        "remote D1 closure execution",
        false,
        error instanceof Error ? error.message : error,
      ));
    }
  } else {
    checks.push(result("remote D1 closure execution", false, "remote D1 checks are mandatory for Phase 4 closure"));
  }

  const provisional = {
    schemaVersion: 1,
    phase: "phase-4-verification-closure",
    generatedAt: new Date().toISOString(),
    commit: expectedCommit || source.commit || "local",
    workflowRun: expectedRun || "local",
    branch: actualBranch || "local",
    target: expectedTarget,
    database: expectedDatabase,
    marker: source.marker,
    source: {
      phase: source.phase,
      commit: source.commit,
      workflowRun: source.workflowRun,
      summary: source.summary,
      status: source.status,
    },
    checks,
  };

  const serialized = JSON.stringify(provisional);
  const leakedSecret = SECRET_NAMES
    .map((name) => String(process.env[name] ?? ""))
    .find((secret) => secret.length >= 4 && serialized.includes(secret));
  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized);
  checks.push(result(
    "phase 4 report privacy scan",
    !leakedSecret && !hasEmail,
    leakedSecret || hasEmail ? "sensitive content detected" : "no configured secret or email appears in closure report",
  ));

  const failures = checks.filter((check) => check.status !== "passed");
  const report = {
    ...provisional,
    status: failures.length ? "failed" : "passed",
    summary: {
      passed: checks.filter((check) => check.status === "passed").length,
      failed: checks.filter((check) => check.status === "failed").length,
    },
    checks,
  };

  const closureJsonPath = `${outputDirectory}/phase4-closure.json`;
  const closureMarkdownPath = `${outputDirectory}/phase4-closure.md`;
  await writeFile(closureJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(closureMarkdownPath, markdown(report));

  const files = [
    { path: inputPath, role: "phase3-json" },
    { path: closureJsonPath, role: "phase4-json" },
    { path: closureMarkdownPath, role: "phase4-markdown" },
  ];
  try {
    await readFile(inputMarkdownPath);
    files.splice(1, 0, { path: inputMarkdownPath, role: "phase3-markdown" });
  } catch {}

  const manifestFiles = [];
  for (const file of files) {
    manifestFiles.push({
      role: file.role,
      path: file.path,
      sha256: await fileDigest(file.path),
    });
  }
  const manifest = {
    schemaVersion: 1,
    phase: report.phase,
    generatedAt: new Date().toISOString(),
    commit: report.commit,
    workflowRun: report.workflowRun,
    sourcePhase3Run: report.source.workflowRun,
    sourcePhase3Commit: report.source.commit,
    files: manifestFiles,
  };
  await writeFile(`${outputDirectory}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    `Phase 4 verification closure: ${report.status}; ${report.summary.passed} passed, ${report.summary.failed} failed.`,
  );
  return report;
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    const report = await runClosure();
    if (report.status !== "passed") process.exitCode = 1;
  } catch (error) {
    console.error(`Phase 4 verification closure failed: ${redact(error instanceof Error ? error.message : error)}`);
    process.exitCode = 1;
  }
}
