import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");

export const retiredPaths = Object.freeze([
  "supabase",
  "scripts/phase4",
  "scripts/phase5",
  "scripts/validate-d1-phase2.mjs",
  "scripts/validate-d1-phase3.mjs",
  "scripts/validate-d1-phase4.mjs",
  "wrangler.jsonc",
  "wrangler.d1.phase2.jsonc",
  "wrangler.phase3.jsonc",
  "wrangler.phase4.jsonc",
  "lib/data/migration-contract.ts",
  "lib/data/phase2-contract.ts",
  "lib/data/phase3-service-adapter.ts",
  "lib/data/phase4-shadow-read.ts",
  ".github/workflows/phase1-authenticated-mutations.yml",
  ".github/workflows/phase2-fixture-discovery.yml",
  ".github/workflows/phase3-exact-commit-retirement-closure.yml",
  ".github/workflows/phase3-mutation-matrix.yml",
  ".github/workflows/phase4-shadow.yml",
  ".github/workflows/phase4-verification-closure.yml",
  ".github/workflows/phase5-cutover-preflight.yml",
  ".github/workflows/phase5-final-delta.yml",
  ".github/workflows/phase5-inventory.yml",
  ".github/workflows/supabase-retirement-stage1-final.yml",
  ".github/workflows/supabase-retirement-stage2-apply-blob.yml",
  ".github/workflows/supabase-retirement-stage2-closure.yml",
  ".github/workflows/supabase-retirement-stage2-inventory.yml",
  ".github/workflows/supabase-retirement-stage2-workspace.yml",
]);

export const requiredEvidence = Object.freeze([
  "docs/SUPABASE_RETIREMENT_PHASE3_STATUS.md",
  "docs/SUPABASE_RETIREMENT_PHASE4_STATUS.md",
  "SUPABASE_RETIREMENT_PHASE5.md",
  "lib/data/database.types.ts",
  "d1/migrations",
  "wrangler.web.jsonc",
  "workers/icai-sync/wrangler.jsonc",
  "workers/billing/wrangler.jsonc",
]);

const retiredPackageScripts = Object.freeze([
  "test:cloudflare-phase2",
  "test:cloudflare-phase3",
  "test:cloudflare-phase4",
  "d1:phase2:validate",
  "d1:phase3:validate",
  "d1:phase4:validate",
  "phase4:shadow",
  "phase4:reconcile",
  "phase4:rollback",
  "cf:check:phase3",
  "cf:check:phase4",
]);

const runtimeTokenRules = Object.freeze([
  ["supabase-sdk", /@supabase\/(?:ssr|supabase-js)/i],
  ["supabase-public-env", /NEXT_PUBLIC_SUPABASE_(?:URL|ANON_KEY|PUBLISHABLE_KEY)/],
  ["supabase-server-env", /(?:^|\W)(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL)(?:\W|$)/],
  ["supabase-runtime-module", /(?:@\/|\.\.?\/)+lib\/supabase\//],
  ["supabase-compat-module", /supabase-compat/i],
  ["supabase-client-factory", /create(?:Server|Browser|Admin)?SupabaseClient/],
]);

const runtimeRoots = ["app", "components", "lib", "server", "workers"];
const runtimeFiles = [
  ".env.example",
  "package.json",
  "custom-worker.ts",
  "proxy.ts",
  "next.config.ts",
  "open-next.config.ts",
  "wrangler.web.jsonc",
  "wrangler.smoke.jsonc",
  ".github/workflows/ci.yml",
  ".github/workflows/deploy-staging.yml",
  ".github/workflows/supabase-retirement-closure.yml",
];
const sourceExtension = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|jsonc|yml|yaml)$/i;

export function scanText(text, file = "fixture") {
  const blockers = [];
  for (const [rule, pattern] of runtimeTokenRules) {
    if (pattern.test(text)) blockers.push({ rule, file });
  }
  return blockers;
}

export function verifyRepository(repoRoot = root) {
  const failures = [];
  for (const relative of retiredPaths) {
    if (existsSync(path.join(repoRoot, relative))) failures.push({ rule: "retired-path-still-present", file: relative });
  }
  for (const relative of requiredEvidence) {
    if (!existsSync(path.join(repoRoot, relative))) failures.push({ rule: "required-evidence-missing", file: relative });
  }

  const packagePath = path.join(repoRoot, "package.json");
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    const dependencies = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    for (const name of ["@supabase/ssr", "@supabase/supabase-js"]) {
      if (dependencies[name]) failures.push({ rule: "retired-dependency", file: `package.json:${name}` });
    }
    for (const name of retiredPackageScripts) {
      if (pkg.scripts?.[name]) failures.push({ rule: "retired-package-script", file: `package.json:${name}` });
    }
  }

  const files = new Set(runtimeFiles);
  for (const relative of runtimeRoots) {
    const absolute = path.join(repoRoot, relative);
    if (!existsSync(absolute)) continue;
    const visit = (dir) => {
      for (const entry of readdirSync(path.join(repoRoot, dir))) {
        const child = path.join(dir, entry);
        const childAbsolute = path.join(repoRoot, child);
        if (statSync(childAbsolute).isDirectory()) visit(child);
        else if (sourceExtension.test(entry)) files.add(child);
      }
    };
    visit(relative);
  }

  for (const relative of files) {
    const absolute = path.join(repoRoot, relative);
    if (!existsSync(absolute)) continue;
    const text = readFileSync(absolute, "utf8");
    failures.push(...scanText(text, relative));
  }

  return { ok: failures.length === 0, failures, scannedFiles: files.size };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
if (invokedDirectly) {
  const result = verifyRepository(root);
  console.log(JSON.stringify({ schemaVersion: 1, status: result.ok ? "pass" : "fail", scannedFiles: result.scannedFiles, failures: result.failures }, null, 2));
  if (!result.ok) process.exit(1);
}
