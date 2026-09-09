import { spawnSync } from "node:child_process";

const database = "ca-progress-v2-phase4-shadow";
const config = "wrangler.jsonc";
const migrations = [
  ["0012", "d1/migrations/0012_product_phase0_autofetch_contracts.sql"],
  ["0013", "d1/migrations/0013_product_phase2_onboarding_experience.sql"],
  ["0014", "d1/migrations/0014_product_phase3_study_sessions_reflection.sql"],
  ["0015", "d1/migrations/0015_product_phase4_progress_test_integration.sql"],
  ["0016", "d1/migrations/0016_product_phase5_test_archive.sql"],
  ["0017", "d1/migrations/0017_product_phase6_revision_notes.sql"],
  ["0018", "d1/migrations/0018_product_phase7_community_verification.sql"],
  ["0019", "d1/migrations/0019_product_phase8_planning_notifications.sql"],
  ["0020", "d1/migrations/0020_product_phase10_study_profiles.sql"],
  ["0021", "d1/migrations/0021_product_phase11_study_buddy.sql"],
  ["0022", "d1/migrations/0022_product_phase12_gamification.sql"],
  ["0023", "d1/migrations/0023_product_phase13_leaderboards_rewards_referrals.sql"],
  ["0024", "d1/migrations/0024_icai_source_bootstrap.sql"],
  ["0025", "d1/migrations/0025_icai_review_audit.sql"],
  ["0026", "d1/migrations/0026_icai_sync_recovery.sql"],
  ["0027", "d1/migrations/0027_admin_phase1_security.sql"],
  ["0028", "d1/migrations/0028_icai_sync_continuation.sql"],
  ["0029", "d1/migrations/0029_icai_bootstrap_window.sql"],
  ["0030", "d1/migrations/0030_icai_phase1_current_sources.sql"],
  ["0031", "d1/migrations/0031_icai_phase1_exact_source_scope.sql"],
];

if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required for retained D1 migration verification.");
}

function wrangler(args, { capture = false } = {}) {
  const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", ...args], {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    if (capture) {
      if (result.stdout) process.stderr.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    throw new Error(`wrangler ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
  }
  return result.stdout ?? "";
}

function query(sql) {
  const output = wrangler([
    "d1", "execute", database,
    "--remote",
    `--config=${config}`,
    "--json",
    "--command", sql,
  ], { capture: true });
  const start = output.indexOf("[");
  if (start < 0) throw new Error(`Unexpected Wrangler JSON output: ${output.slice(0, 500)}`);
  return JSON.parse(output.slice(start));
}

const ledgerResult = query("SELECT version FROM _ca_schema_migrations WHERE version BETWEEN '0012' AND '0031' ORDER BY version;");
const applied = new Set((ledgerResult?.[0]?.results ?? []).map((row) => String(row.version)));

for (const [version, file] of migrations) {
  if (applied.has(version)) {
    console.log(`[retained-d1] ${version} already applied; skipping replay.`);
    continue;
  }
  console.log(`[retained-d1] applying ${version} from ${file}`);
  wrangler([
    "d1", "execute", database,
    "--remote",
    `--config=${config}`,
    `--file=${file}`,
  ]);
}

const versions = migrations.map(([version]) => `'${version}'`).join(",");
const verification = query(`SELECT version FROM _ca_schema_migrations WHERE version IN (${versions}) ORDER BY version; PRAGMA foreign_key_check;`);
const verified = new Set((verification?.[0]?.results ?? []).map((row) => String(row.version)));
const missing = migrations.map(([version]) => version).filter((version) => !verified.has(version));
if (missing.length) throw new Error(`Retained D1 migrations missing after apply: ${missing.join(", ")}`);
const fkViolations = verification?.[1]?.results ?? [];
if (fkViolations.length) throw new Error(`D1 foreign-key verification failed with ${fkViolations.length} violation(s).`);

console.log(`[retained-d1] PASS: ${migrations.length} required migrations present; foreign keys clean.`);
