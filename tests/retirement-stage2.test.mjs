import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { scanRepository, scanText } from "../scripts/phase5/retirement-stage2-scan.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("Stage 2 scanner reports zero active Supabase runtime blockers", () => {
  const result = scanRepository(repoRoot);
  assert.ok(result.files.length > 100, `expected broad runtime scan, got ${result.files.length} files`);
  assert.ok(result.files.some((file) => file.endsWith(`${path.sep}lib${path.sep}env.ts`)), "lib/env.ts must be part of the active runtime scan");
  assert.deepEqual(result.blockers, []);

  const output = execFileSync(process.execPath, [path.join(repoRoot, "scripts/phase5/retirement-stage2-scan.mjs")], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.match(output, /Stage 2 active runtime blockers: 0/);
  assert.match(output, /PASS — zero active Supabase runtime blockers/);
});

test("scanner blocks Supabase SDK, runtime modules, compatibility architecture, selectors, hosts, secrets and client usage", () => {
  const fixture = [
    'import { createClient } from "@supabase/supabase-js";',
    'import type { Database } from "@/lib/supabase/database.types";',
    'import { createD1ServerCompatClient } from "@/lib/data/d1/supabase-compat";',
    'const legacyClient = new D1SupabaseCompatClient(db);',
    'const runtime = CA_DATA_RUNTIME;',
    'const endpoint = "https://example.supabase.co";',
    'const retiredKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;',
    'await supabase.auth.getUser();',
  ].join("\n");
  const blockers = scanText(fixture, "fixture.ts");
  const rules = new Set(blockers.map((blocker) => blocker.rule));
  assert.ok(rules.has("supabase-sdk-import"));
  assert.ok(rules.has("supabase-runtime-module"));
  assert.ok(rules.has("supabase-compatibility-module"));
  assert.ok(rules.has("supabase-compatibility-symbol"));
  assert.ok(rules.has("runtime-selector"));
  assert.ok(rules.has("supabase-runtime-secret-or-host"));
  assert.ok(rules.has("supabase-runtime-client-usage"));
});

test("provider-neutral database types replace the Supabase-named type boundary", () => {
  assert.equal(fs.existsSync(path.join(repoRoot, "lib/data/database.types.ts")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "lib/supabase/database.types.ts")), false);
  const fixture = 'import type { Database } from "@/lib/supabase/database.types";\ntype Row = Database["public"];';
  assert.ok(scanText(fixture, "types-only.ts").some((blocker) => blocker.rule === "supabase-runtime-module"));
});

test("application auth provider is Cloudflare-only", () => {
  const source = read("lib/auth/provider.ts");
  assert.match(source, /startCloudflareOAuth/);
  assert.match(source, /exchangeCloudflareOAuthCode/);
  assert.match(source, /getCloudflareRequestAuth/);
  assert.match(source, /signOutCloudflareSession/);
  assert.deepEqual(scanText(source, "lib/auth/provider.ts"), []);
});

test("canonical application database runtime is D1", () => {
  const source = read("lib/data/d1/client.ts");
  assert.match(source, /getD1RuntimeDatabase/);
  assert.match(source, /Cloudflare D1 DB binding is required/);
  assert.match(source, /createD1ServerClient/);
  assert.match(source, /createD1AdminClient/);
  assert.doesNotMatch(source, /D1SupabaseCompatClient|createD1ServerCompatClient|createD1AdminCompatClient/);
  assert.deepEqual(scanText(source, "lib/data/d1/client.ts"), []);
});

test("resource upload completion uses R2 and D1 without Supabase storage fallback", () => {
  const source = read("app/api/resources/upload-complete/route.ts");
  assert.match(source, /getResourceR2Bucket/);
  assert.match(source, /getHotD1Database/);
  assert.match(source, /RESOURCE_R2_STORAGE_BUCKET/);
  assert.deepEqual(scanText(source, "app/api/resources/upload-complete/route.ts"), []);
});

test("critical Stage 2 service families have no active Supabase runtime fallback", () => {
  const criticalFiles = [
    "lib/community/service.ts",
    "lib/resources/service.ts",
    "lib/planner/service.ts",
    "lib/progress/service.ts",
    "lib/study/service.ts",
    "lib/dashboard/reference.ts",
    "lib/billing/service.ts",
    "lib/icai/query.ts",
    "server/health/get-health-snapshot.ts",
  ];

  for (const relativePath of criticalFiles) {
    assert.deepEqual(scanText(read(relativePath), relativePath), [], relativePath);
  }
});

test("static Stage 2 validation workflow cannot declare retirement complete", () => {
  const workflow = read(".github/workflows/supabase-retirement-stage2-closure.yml");
  assert.doesNotMatch(workflow, /Record Stage 2 completion/);
  assert.doesNotMatch(workflow, /Status:\s*\*\*COMPLETE\*\*/);
  assert.doesNotMatch(workflow, /cat > SUPABASE_RETIREMENT_STAGE2\.md/);
  assert.match(workflow, /Static\/build validation only\./);
});
