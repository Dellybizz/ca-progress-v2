import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 1 bootstrap uses deterministic current ICAI New Scheme and exam sources", () => {
  const migration = read("d1/migrations/0030_icai_phase1_current_sources.sql");

  assert.match(migration, /https:\/\/www\.icai\.org\/post\/foundation-nset/);
  assert.match(migration, /https:\/\/www\.icai\.org\/post\/intermediate-nset/);
  assert.match(migration, /https:\/\/www\.icai\.org\/post\/final-nset/);
  assert.match(migration, /https:\/\/www\.icai\.org\/post\/exam-may-2026/);
  assert.match(migration, /https:\/\/www\.icai\.org\/post\/24137/);
  assert.match(migration, /https:\/\/www\.icai\.org\/category\/bos-important-announcements\/1/);
  assert.match(migration, /bootstrap_attempt_floor[^\n]*2026-05/);
  assert.match(migration, /bootstrap_published_floor[^\n]*2025-12-01/);
  assert.match(migration, /bootstrap_complete[^\n]*false/);
  assert.match(migration, /last_content_hash = NULL|last_content_hash=NULL/);
});

test("Phase 1 Study Material traversal ends at direct ICAI PDFs and is bounded", () => {
  const resolver = read("workers/icai-sync/direct-resource-resolver.ts");

  assert.match(resolver, /MAX_STUDY_DEPTH = 3/);
  assert.match(resolver, /MAX_CHILD_PAGES = 80/);
  assert.match(resolver, /const visited = new Set<string>\(\)/);
  assert.match(resolver, /parsed\.pathname\.includes\("\/post\/"\)/);
  assert.match(resolver, /nestedPageIsInBootstrapWindow/);
  assert.match(resolver, /applicabilityPageIsInBootstrapWindow/);
  assert.match(resolver, /Applicable\\s\+for/);
  assert.match(resolver, /detectAttemptKeys\(match\[0\]\)/);
  assert.match(resolver, /compactUrlAttemptKey/);
  assert.match(resolver, /urlAttempt < attemptFloor/);
  assert.match(resolver, /attemptFloor.*2026-05/);
  assert.match(resolver, /isDirectPdf\(resource\.officialUrl\)/);
  assert.match(resolver, /!applicabilityPageIsInBootstrapWindow\(landing\.html, source\)/);
  assert.match(resolver, /droppedLandingPages \+= 1/);
  assert.match(resolver, /Study Material list\/subject page is never student-facing/);
});

test("Phase 1 prevents cross-course attempt pollution from shared exam notices", () => {
  const policy = read("workers/icai-sync/bootstrap-policy.ts");

  assert.match(policy, /foundation: new Set\(\["01", "05", "09"\]\)/);
  assert.match(policy, /intermediate: new Set\(\["01", "05", "09"\]\)/);
  assert.match(policy, /final: new Set\(\["05", "11"\]\)/);
  assert.match(policy, /normalizeResourceAttemptScope/);
  assert.match(policy, /level×attempt cross product/);
  assert.match(policy, /attemptKeys: everyKeyAppliesToEveryLevel \? validKeys : \[\]/);
  assert.match(policy, /attemptAllowedForLevel\(event\.attemptKey, event\.levelCode\)/);
});

test("Phase 1 keeps the readable two-page admin review contract", () => {
  const monitor = read("app/(admin)/admin/icai-sync/page.tsx");
  const data = read("app/(admin)/admin/icai-sync/data/page.tsx");
  const review = read("components/icai/admin-sync-data.tsx");

  assert.match(monitor, /IcaiAdminSyncMonitor/);
  assert.match(data, /IcaiAdminSyncData/);
  assert.match(review, /What will students see\?/);
  assert.match(review, /Open ICAI PDF/);
  assert.match(review, /Countdown \/ attempt date shown to students/);
  assert.match(review, /Open official exam notification/);
});
