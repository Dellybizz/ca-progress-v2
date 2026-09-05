import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { retiredPaths, requiredEvidence, scanText, verifyRepository } from "../scripts/verify-supabase-retired.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

test("Supabase migration and compatibility machinery stays retired", () => {
  for (const relative of retiredPaths) assert.equal(existsSync(path.join(root, relative)), false, relative);
  for (const relative of requiredEvidence) assert.equal(existsSync(path.join(root, relative)), true, relative);
});

test("active runtime and CI have no Supabase SDK, env, client or compat blockers", () => {
  const result = verifyRepository(root);
  assert.deepEqual(result.failures, []);
  assert.ok(result.scannedFiles > 20);
  for (const fixture of [
    'import { createClient } from "@supabase/supabase-js";',
    'const url = process.env.NEXT_PUBLIC_SUPABASE_URL;',
    'const key = process.env.SUPABASE_SERVICE_ROLE_KEY;',
    'import { x } from "@/lib/supabase/server";',
    'import { x } from "./lib/data/d1/supabase-compat";',
    'createServerSupabaseClient()',
  ]) assert.ok(scanText(fixture).length > 0, fixture);
});

test("package scripts expose only post-retirement Cloudflare validation paths", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["verify:retirement"], "node scripts/verify-supabase-retired.mjs");
  assert.match(pkg.scripts["cf:build"], /--skipWranglerConfigCheck/);
  assert.match(pkg.scripts["cf:check"], /cf:check:web/);
  assert.match(pkg.scripts["cf:check:web"], /wrangler\.web\.jsonc/);
  assert.match(pkg.scripts["cf:deploy:web"], /wrangler\.web\.jsonc/);
  assert.equal(existsSync(path.join(root, "wrangler.jsonc")), false);
  for (const name of ["phase4:shadow", "phase4:reconcile", "phase4:rollback", "cf:check:phase3", "cf:check:phase4"]) assert.equal(pkg.scripts[name], undefined);
});

test("permanent closure and V2 CI enforce retirement before and after build validation", () => {
  for (const workflowPath of [".github/workflows/ci.yml", ".github/workflows/supabase-retirement-closure.yml"]) {
    const workflow = read(workflowPath);
    assert.match(workflow, /npm run verify:retirement/);
    assert.match(workflow, /npm run typecheck/);
    assert.match(workflow, /npm run lint/);
    assert.match(workflow, /npm run build/);
    assert.match(workflow, /npm run cf:check/);
    assert.match(workflow, /npm run cf:smoke/);
    assert.match(workflow, /npm test/);
  }
});
