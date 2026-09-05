import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scanRepository, scanText } from "../scripts/phase5/retirement-stage2-scan.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const retiredClientModules = [
  "lib/supabase/admin.ts",
  "lib/supabase/browser.ts",
  "lib/supabase/server.ts",
  "lib/supabase/proxy.ts",
];

const retiredRuntimeTokens = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

test("Supabase SDK packages are retired from the application dependency graph", () => {
  const pkg = JSON.parse(read("package.json"));
  const dependencies = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  assert.equal(dependencies["@supabase/ssr"], undefined);
  assert.equal(dependencies["@supabase/supabase-js"], undefined);
});

test("Supabase runtime client modules stay retired and the schema contract is provider-neutral", () => {
  for (const modulePath of retiredClientModules) {
    assert.equal(existsSync(path.join(root, modulePath)), false, `${modulePath} must stay retired`);
  }
  assert.equal(existsSync(path.join(root, "lib/data/database.types.ts")), true, "provider-neutral database types must remain available");
  assert.equal(existsSync(path.join(root, "lib/supabase/database.types.ts")), false, "Supabase-named type boundary must stay retired after Phase 5");
});

test("application runtime environment no longer declares Supabase host or secret configuration", () => {
  const template = read(".env.example");
  const runtimeEnv = read("lib/env.ts");
  for (const token of retiredRuntimeTokens) {
    assert.equal(template.includes(token), false, `.env.example still contains ${token}`);
    assert.equal(runtimeEnv.includes(token), false, `lib/env.ts still contains ${token}`);
  }
  assert.doesNotMatch(runtimeEnv, /getSupabase(?:Public|Admin)Config/);
});

test("Stage 2 scanner covers lib/env.ts and rejects retired publishable-key configuration", () => {
  const scan = scanRepository(root);
  assert.ok(scan.files.some((file) => file.endsWith(`${path.sep}lib${path.sep}env.ts`)), "lib/env.ts is not scanned");
  assert.deepEqual(scan.blockers, []);
  const fixture = "const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;";
  assert.ok(scanText(fixture, "fixture.ts").some((item) => item.rule === "supabase-runtime-secret-or-host"));
});

test("retirement static validation reruns when the environment template changes", () => {
  const workflow = read(".github/workflows/supabase-retirement-stage2-closure.yml");
  assert.match(workflow, /- \.env\.example/);
});

test("migration evidence remains preserved for later retirement phases", () => {
  for (const retainedPath of [
    "lib/data/database.types.ts",
    "scripts/phase4/production-shadow.mjs",
    "scripts/phase5/final-backup.mjs",
    "supabase/migrations",
    "docs/SUPABASE_RETIREMENT_PHASE3_STATUS.md",
  ]) {
    assert.equal(existsSync(path.join(root, retainedPath)), true, `retained retirement evidence missing ${retainedPath}`);
  }
});
