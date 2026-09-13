import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { certificationMatrix, promotionGates, rollbackTriggers, rolloutStages } from "../../config/product-consistency-rollout.mjs";
import { personaContracts, routeContracts } from "../../config/product-consistency-route-contracts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const production = process.argv.includes("--production");
const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
const failures = [];
const checks = [];
const record = (name, pass, detail) => { checks.push({ name, pass, detail }); if (!pass) failures.push(`${name}: ${detail}`); };
const run = (name, command, args, env = {}) => {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit", env: { ...process.env, ...env } });
  record(name, result.status === 0, `exit ${result.status ?? "unknown"}`);
};

for (const contract of routeContracts) record(`route:${contract.route}`, existsSync(resolve(root, contract.page)), contract.page);
record("personas", personaContracts.length >= 8, `${personaContracts.length} representative personas`);
for (const [axis, values] of Object.entries(certificationMatrix)) record(`matrix:${axis}`, Array.isArray(values) && values.length >= 2, `${values.length} states`);
record("rollout-order", rolloutStages.map((stage) => stage.audiencePercent).join(",") === "0,5,25,100", "internal → 5% → 25% → 100%");
record("critical-gate", promotionGates.openCriticalConsistencyFindings === 0, "zero critical findings required");
record("non-destructive-rollback", rollbackTriggers.rollbackAction.includes("never delete user data"), rollbackTriggers.rollbackAction);

if (production) {
  for (const key of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "DEPLOY_BASE_URL"]) record(`environment:${key}`, Boolean(process.env[key]), process.env[key] ? "configured" : "missing");
  if (!failures.length) {
    run("latest-consistency-scan", process.platform === "win32" ? "npm.cmd" : "npm", ["run", "audit:product-consistency:phase10:gate"]);
    run("cloudflare-runtime-smoke", process.platform === "win32" ? "npm.cmd" : "npm", ["run", "cf:smoke"], { SMOKE_BASE_URL: process.env.DEPLOY_BASE_URL, SMOKE_AUTH_COOKIE: process.env.SMOKE_AUTH_COOKIE ?? "" });
    run("d1-foreign-key-integrity", process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", "d1", "execute", "ca-progress-v2-phase4-shadow", "--remote", "--config=wrangler.jsonc", "--command", "PRAGMA foreign_key_check;"]);
  }
}

const report = { schemaVersion: 1, phase: 12, mode: production ? "production" : "repository", generatedAt: new Date().toISOString(), passed: failures.length === 0, rolloutStages, promotionGates, rollbackTriggers, checks, failures };
if (output) { const target = resolve(root, output); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8"); }
console.log(JSON.stringify({ phase: report.phase, mode: report.mode, passed: report.passed, checks: checks.length, failures }, null, 2));
if (failures.length) process.exit(1);
