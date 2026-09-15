import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { p0CommercialTables, refinementP0 } from "../../config/refinement-p0-live-state.mjs";

const root = resolve(import.meta.dirname, "../..");
const { values } = parseArgs({
  options: {
    production: { type: "boolean", default: false },
    "evidence-dir": { type: "string", default: "deployment-evidence/p0-live-state" },
  },
});
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const read = (path) => readFileSync(resolve(root, path), "utf8");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const head = git("rev-parse", "HEAD");
const branch = git("branch", "--show-current");
const migrations = readdirSync(resolve(root, "d1/migrations")).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();

check(refinementP0.phase === "P0", "phase identifier changed");
check(Boolean(branch) || process.env.GITHUB_ACTIONS === "true", "repository branch could not be identified");
check(git("merge-base", "--is-ancestor", refinementP0.baseCommit, "HEAD") === "", `live base ${refinementP0.baseCommit} is not an ancestor of ${head}`);
check(migrations.length === refinementP0.database.migrationCount, `expected ${refinementP0.database.migrationCount} migrations, found ${migrations.length}`);
check(migrations.at(-1) === refinementP0.database.latestMigration, `latest migration is ${migrations.at(-1) ?? "missing"}`);
for (const worker of refinementP0.workers) {
  check(existsSync(resolve(root, worker.config)), `${worker.key} Worker config is missing`);
  check(read(worker.config).includes(`"name": "${worker.name}"`), `${worker.key} Worker name does not match ${worker.name}`);
}
for (const table of p0CommercialTables) {
  check(read("d1/migrations/0002_phase2_billing_mentor_catalog.sql").includes(table)
    || read("d1/migrations/0046_product_consistency_phase9_granular_entitlements.sql").includes(table), `commercial table ${table} is not retained by the migration chain`);
}
const deploymentWorkflow = read(".github/workflows/p0-live-state-lock.yml");
for (const required of ["deployments list", "PRAGMA foreign_key_check", "_ca_schema_migrations", "payment_orders", "plan_policy_publications", "rollback-manifest.json"]) {
  check(deploymentWorkflow.includes(required), `credentialed P0 workflow is missing ${required}`);
}

let production = null;
if (values.production) {
  const evidenceDir = resolve(root, values["evidence-dir"]);
  const required = ["web-deployments.json", "billing-deployments.json", "icai-deployments.json", "d1-state.json", "rollback-manifest.json"];
  for (const name of required) check(existsSync(resolve(evidenceDir, name)), `production evidence is missing ${name}`);
  if (failures.length === 0) {
    const d1 = JSON.parse(readFileSync(resolve(evidenceDir, "d1-state.json"), "utf8"));
    const batches = Array.isArray(d1) ? d1 : [];
    const resultSets = batches.flatMap((batch) => Array.isArray(batch?.results) ? [batch.results] : []);
    const ledgerRows = resultSets.find((rows) => rows.some((row) => Object.hasOwn(row, "migration_count"))) ?? [];
    const ledger = ledgerRows[0];
    const foreignKeyRows = resultSets.at(-1) ?? [];
    check(Number(ledger?.migration_count) === refinementP0.database.migrationCount, `remote ledger count is ${ledger?.migration_count ?? "missing"}`);
    check(ledger?.latest_version === refinementP0.database.latestMigration.slice(0, 4), `remote latest migration is ${ledger?.latest_version ?? "missing"}`);
    check(foreignKeyRows.length === 0, "remote D1 foreign-key check returned violations");
    production = { evidenceDir, remoteMigrationCount: Number(ledger?.migration_count), foreignKeyViolations: foreignKeyRows.length };
  }
}

const report = {
  phase: refinementP0.phase,
  passed: failures.length === 0,
  mode: values.production ? "production" : "repository",
  repository: { branch, head, liveBaseBranch: refinementP0.liveBaseBranch, liveBase: refinementP0.baseCommit },
  migrations: { count: migrations.length, latest: migrations.at(-1) },
  workers: refinementP0.workers.map(({ key, name }) => ({ key, name })),
  production,
  failures,
  nextPhase: failures.length === 0 && values.production ? refinementP0.nextPhase : null,
};
if (values.production) writeFileSync(resolve(root, values["evidence-dir"], "p0-certification.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
