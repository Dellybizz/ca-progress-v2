import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const REPORT_DIRECTORY = "phase1-report";
const REPORT_JSON = `${REPORT_DIRECTORY}/verification-foundation.json`;
const REPORT_MARKDOWN = `${REPORT_DIRECTORY}/verification-foundation.md`;
const REQUIRED_ENVIRONMENT = ["SMOKE_MUTATION_AUTH_COOKIE", "SMOKE_MODERATOR_AUTH_COOKIE", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "PHASE1_D1_DATABASE"];
const SECRET_ENVIRONMENT = ["SMOKE_MUTATION_AUTH_COOKIE", "SMOKE_MODERATOR_AUTH_COOKIE", "CLOUDFLARE_API_TOKEN"];
const PRIVILEGED_ROLES = new Set(["moderator", "admin", "owner", "parent_owner"]);
const baseUrl = (process.env.SMOKE_BASE_URL || "https://ca-progress-v2.habeebaasif622.workers.dev").replace(/\/$/, "");
const checks = [];
const sensitiveValues = SECRET_ENVIRONMENT.map((name) => process.env[name] || "").filter(Boolean);
const observedIdentityValues = [];

function digest(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function redactText(value) {
  let output = String(value ?? "");
  for (const secret of [...sensitiveValues, ...observedIdentityValues].sort((a, b) => b.length - a.length)) {
    if (secret.length >= 4) output = output.split(secret).join(`[redacted:${digest(secret)}]`);
  }
  output = output.replace(/([?&](?:code|token|key|secret)=)[^&\s]+/gi, "$1[redacted]");
  output = output.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");
  return output.slice(0, 2_000);
}

function record(name, status, evidence, required = true) {
  if (!new Set(["passed", "failed", "unsupported"]).has(status)) throw new Error(`Invalid check status: ${status}`);
  checks.push({ name, status, required, evidence: redactText(evidence) });
}

function normalizedCookie(name) {
  const value = process.env[name]?.trim() || "";
  if (!value) return "";
  if (/[\r\n]/.test(value)) throw new Error(`${name} contains an invalid newline`);
  return value.includes("=") ? value : `ca_session=${value}`;
}

async function viewer(sessionName, cookie) {
  try {
    const response = await fetch(`${baseUrl}/api/auth/viewer`, {
      method: "GET",
      redirect: "manual",
      headers: { cookie, accept: "application/json", "x-ca-phase1-test": "foundation" },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.authenticated !== true || typeof body.id !== "string" || !body.id) {
      record(`${sessionName} session authentication`, "failed", `HTTP ${response.status}; authenticated=${body?.authenticated === true}`);
      return null;
    }
    observedIdentityValues.push(body.id);
    record(`${sessionName} session authentication`, "passed", `HTTP ${response.status}; stable user hash=${digest(body.id)}`);
    return body.id;
  } catch (error) {
    record(`${sessionName} session authentication`, "failed", `Request failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function remoteD1(sql) {
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["wrangler", "d1", "execute", process.env.PHASE1_D1_DATABASE, "--remote", "--json", "--config", "wrangler.web.jsonc", "--command", sql],
    { encoding: "utf8", env: process.env, maxBuffer: 10 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) throw new Error(redactText(result.error?.message || result.stderr || `Wrangler exited ${result.status}`));
  const parsed = JSON.parse(result.stdout);
  const execution = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!execution?.success || !Array.isArray(execution.results)) throw new Error("Wrangler returned an unsuccessful or malformed D1 response");
  return execution.results;
}

function verifyRemoteIdentity(sessionName, userId, requirePrivilegedRole) {
  if (!userId) return;
  try {
    const rows = remoteD1(`SELECT u.user_id,u.role,u.account_state,p.onboarding_completed_at FROM app_users u LEFT JOIN profiles p ON p.user_id=u.user_id WHERE u.user_id=${sqlLiteral(userId)} LIMIT 1`);
    const row = rows[0];
    if (!row || row.user_id !== userId || row.account_state !== "active") {
      record(`${sessionName} remote D1 identity`, "failed", `Expected one active app_users row; rows=${rows.length}`);
      return;
    }
    if (requirePrivilegedRole && !PRIVILEGED_ROLES.has(row.role)) {
      record(`${sessionName} remote D1 identity`, "failed", `Role ${row.role || "missing"} is not privileged`);
      return;
    }
    record(`${sessionName} remote D1 identity`, "passed", `database=${process.env.PHASE1_D1_DATABASE}; stable user hash=${digest(userId)}; role=${row.role}; active=true; onboarding=${Boolean(row.onboarding_completed_at)}`);
  } catch (error) {
    record(`${sessionName} remote D1 identity`, "failed", `Remote query failed: ${error instanceof Error ? error.message : error}`);
  }
}

function markdown(report) {
  const rows = report.checks.map((check) => `| ${check.name} | ${check.status} | ${check.required ? "yes" : "no"} | ${check.evidence.replaceAll("|", "\\|")} |`).join("\n");
  return `# Phase 1 verification foundation\n\n- Result: **${report.status}**\n- Generated: ${report.generatedAt}\n- Commit: \`${report.commit}\`\n- Workflow run: \`${report.workflowRun}\`\n- Target: ${report.target}\n- D1 database: \`${report.database}\`\n\n| Check | Status | Required | Evidence |\n| --- | --- | --- | --- |\n${rows}\n\nNo mutation-family result is claimed by this foundation report. Required skipped checks are failures; unsupported capabilities must be explicitly recorded by later phases.\n`;
}

await mkdir(REPORT_DIRECTORY, { recursive: true });
for (const name of REQUIRED_ENVIRONMENT) record(`environment:${name}`, process.env[name] ? "passed" : "failed", process.env[name] ? "configured" : "missing");

let normalUserId = null;
let moderatorUserId = null;
if (process.env.SMOKE_MUTATION_AUTH_COOKIE) normalUserId = await viewer("mutation user", normalizedCookie("SMOKE_MUTATION_AUTH_COOKIE"));
if (process.env.SMOKE_MODERATOR_AUTH_COOKIE) moderatorUserId = await viewer("moderator", normalizedCookie("SMOKE_MODERATOR_AUTH_COOKIE"));
if (normalUserId && moderatorUserId) {
  record("independent test identities", normalUserId !== moderatorUserId ? "passed" : "failed", normalUserId !== moderatorUserId ? "mutation and moderator sessions resolve to different stable IDs" : "both sessions resolve to the same stable ID");
}
if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID && process.env.PHASE1_D1_DATABASE) {
  verifyRemoteIdentity("mutation user", normalUserId, false);
  verifyRemoteIdentity("moderator", moderatorUserId, true);
}

const requiredFailures = checks.filter((check) => check.required && check.status !== "passed");
const report = {
  schemaVersion: 1,
  phase: "phase-1-verification-foundation",
  status: requiredFailures.length ? "failed" : "passed",
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA || "local",
  workflowRun: process.env.GITHUB_RUN_ID || "local",
  target: baseUrl,
  database: process.env.PHASE1_D1_DATABASE || "unconfigured",
  summary: {
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
    unsupported: checks.filter((check) => check.status === "unsupported").length,
  },
  checks,
};

const serialized = JSON.stringify(report, null, 2);
const leakedSecret = sensitiveValues.find((secret) => secret.length >= 4 && serialized.includes(secret));
if (leakedSecret) {
  report.status = "failed";
  report.summary.failed += 1;
  report.checks.push({ name: "report secret scan", status: "failed", required: true, evidence: "a configured secret appeared in the report buffer" });
} else {
  report.checks.push({ name: "report secret scan", status: "passed", required: true, evidence: "no configured credential value appears in the report" });
  report.summary.passed += 1;
}

await writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(REPORT_MARKDOWN, markdown(report));
console.log(`Phase 1 verification foundation: ${report.status}; ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.unsupported} unsupported.`);
if (report.status !== "passed") process.exitCode = 1;
