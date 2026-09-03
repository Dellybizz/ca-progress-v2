import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("shared cache is versioned, observable, and TTL bounded", () => {
  const source = read("lib/cache/public.ts");
  assert.match(source, /_version/);
  assert.match(source, /BASE_VERSION/);
  assert.match(source, /cache\\.put/);
  assert.match(source, /cache\\.delete/);
  assert.match(source, /outcome: "hit" \\| "miss" \\| "bypass" \\| "write" \\| "invalidate"/);
  assert.match(source, /MAX_DATA_TTL_SECONDS/);
  assert.ok(source.includes("Math.min(MAX_DATA_TTL_SECONDS"));
  assert.match(source, /"academic", "pricing", "icai"/);
  assert.doesNotMatch(source, /progress|activity|entitlement|community/i);
});

test("public catalog loaders use separate cache namespaces without user identity", () => {
  assert.match(read("lib/academic/query.ts"), /namespace: "academic"/);
  assert.match(read("lib/billing/service.ts"), /namespace: "pricing"/);
  assert.match(read("lib/icai/query.ts"), /namespace: "icai"/);
  assert.match(read("lib/icai/query.ts"), /catalog-v1/);
  assert.doesNotMatch(read("lib/academic/query.ts"), /userId|session|progress/);
  assert.doesNotMatch(read("lib/icai/query.ts"), /userId|session|progress/);
});

test("private data paths remain outside shared cache", () => {
  for (const path of [
    "lib/progress/service.ts",
    "lib/planner/service.ts",
    "lib/planner/dashboard.ts",
    "lib/community/service.ts",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /getSharedPublicJson|invalidateSharedPublicCache/);
    assert.doesNotMatch(source, /namespace:\\s*"(?:progress|activity|community|entitlement)"/);
  }
  const billing = read("lib/billing/service.ts");
  assert.match(billing, /getEntitlementForUser/);
  assert.doesNotMatch(billing, /namespace:\\s*"(?:user|private|entitlement)"/);
});

test("ICAI sync and review writes invalidate only affected public keys", () => {
  assert.match(read("lib/icai/sync.ts"), /invalidateSharedPublicCache\\(\\["icai"\\]\\)/);
  assert.match(read("app/(admin)/admin/icai-sync/actions.ts"), /invalidateSharedPublicCache\\(\\["icai"\\]\\)/);
  assert.match(read("lib/cache/public.ts"), /namespaceVersion/);
});
