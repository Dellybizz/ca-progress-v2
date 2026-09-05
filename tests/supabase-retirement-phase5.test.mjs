import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scanRepository, scanText } from "../scripts/phase5/retirement-stage2-scan.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

test("Phase 5 removes Supabase-named active compatibility and type boundaries", () => {
  assert.equal(existsSync(path.join(root, "lib/data/database.types.ts")), true);
  assert.equal(existsSync(path.join(root, "lib/supabase/database.types.ts")), false);
  assert.equal(existsSync(path.join(root, "lib/data/d1/supabase-compat.ts")), false);
});

test("canonical D1 client is provider-neutral and exposes only active D1 factories", () => {
  const source = read("lib/data/d1/client.ts");
  assert.match(source, /export class D1ApplicationClient/);
  assert.match(source, /export async function createD1ServerClient/);
  assert.match(source, /export function createD1AdminClient/);
  assert.doesNotMatch(source, /D1SupabaseCompatClient|createD1ServerCompatClient|createD1AdminCompatClient/);
});

test("active runtime has zero Supabase compatibility or type-path blockers", () => {
  const scan = scanRepository(root);
  assert.deepEqual(scan.blockers, []);
  for (const fixture of [
    'import type { Database } from "@/lib/supabase/database.types";',
    'import { createD1ServerCompatClient } from "@/lib/data/d1/supabase-compat";',
    'const client = new D1SupabaseCompatClient(db);',
    'const client = createD1AdminCompatClient(db);',
  ]) {
    assert.ok(scanText(fixture, "fixture.ts").length > 0, fixture);
  }
});

test("Supabase SDK packages remain absent", () => {
  const pkg = JSON.parse(read("package.json"));
  const dependencies = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  assert.equal(dependencies["@supabase/ssr"], undefined);
  assert.equal(dependencies["@supabase/supabase-js"], undefined);
});

test("current user-facing infrastructure disclosures describe Cloudflare, D1 and R2", () => {
  const privacy = read("app/(public)/privacy/page.tsx");
  const resource = read("app/(student)/resources/[id]/page.tsx");
  assert.doesNotMatch(privacy, /Supabase/i);
  assert.match(privacy, /Cloudflare/);
  assert.match(privacy, /D1/);
  assert.match(privacy, /R2/);
  assert.doesNotMatch(resource, /Supabase/i);
  assert.match(resource, /Cloudflare R2/);
});

test("migration evidence stays preserved for Phase 6 and external cleanup stays deferred", () => {
  for (const retainedPath of [
    "supabase/migrations",
    "scripts/phase4/production-shadow.mjs",
    "scripts/phase5/final-backup.mjs",
    "docs/SUPABASE_RETIREMENT_PHASE3_STATUS.md",
    "docs/SUPABASE_RETIREMENT_PHASE4_STATUS.md",
  ]) {
    assert.equal(existsSync(path.join(root, retainedPath)), true, `missing retained evidence ${retainedPath}`);
  }
});
