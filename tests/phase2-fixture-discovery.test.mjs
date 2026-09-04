import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ExactCleanupRegistry,
  buildProgressRestoreSql,
  exactDeleteSql,
  fixtureMarker,
  normalizeProgressSnapshot,
} from "../scripts/phase5/phase2-fixture-helpers.mjs";

const runner = await readFile("scripts/phase5/fixture-discovery.mjs", "utf8");
const workflow = await readFile(".github/workflows/phase2-fixture-discovery.yml", "utf8");

test("Phase 2 marker and cleanup are exact-id only", async () => {
  assert.equal(fixtureMarker("12345"), "phase1-verification-12345");
  assert.throws(() => exactDeleteSql("community_messages", "id", "%"), /exact values/);
  assert.throws(() => exactDeleteSql("community_messages", "id", "*"), /exact values/);
  assert.equal(exactDeleteSql("community_messages", "id", "msg-123"), "DELETE FROM community_messages WHERE id='msg-123'");

  const seen = [];
  const registry = new ExactCleanupRegistry();
  registry.capture({ kind: "message", id: "first", cleanup: async (id) => seen.push(id) });
  registry.capture({ kind: "resource", id: "second", cleanup: async (id) => seen.push(id) });
  const results = await registry.run();
  assert.deepEqual(seen, ["second", "first"]);
  assert.deepEqual(results.map((item) => item.status), ["passed", "passed"]);
});

test("progress restoration targets one composite key and never erases history", () => {
  const absent = normalizeProgressSnapshot("user-1", "chapter-1", null);
  const absentSql = buildProgressRestoreSql(absent);
  assert.match(absentSql, /^DELETE FROM chapter_progress WHERE user_id='user-1' AND chapter_id='chapter-1'$/);
  assert.doesNotMatch(absentSql, /progress_events/i);
  assert.doesNotMatch(absentSql, /LIKE/i);

  const existing = normalizeProgressSnapshot("user-1", "chapter-1", {
    completed_at: "2026-09-01T00:00:00.000Z",
    revision_1_at: null,
    revision_2_at: null,
    test_1_at: null,
    test_2_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  });
  const existingSql = buildProgressRestoreSql(existing);
  assert.match(existingSql, /ON CONFLICT\(user_id,chapter_id\) DO UPDATE SET/);
  assert.match(existingSql, /'user-1','chapter-1'/);
  assert.doesNotMatch(existingSql, /progress_events/i);
  assert.doesNotMatch(existingSql, /DELETE FROM progress_events/i);
});

test("fixture runner discovers real production scope without starting mutation families", () => {
  assert.match(runner, /attempt_syllabus_map/);
  assert.match(runner, /p\.onboarding_completed_at IS NOT NULL/);
  assert.match(runner, /p\.group_choice IN \('both','not_applicable'\)/);
  assert.match(runner, /cc\.write_policy IN \('members','all'\)/);
  assert.match(runner, /subscription_plans/);
  assert.match(runner, /plan_entitlements/);
  assert.match(runner, /\/r2\/buckets\//);
  assert.match(runner, /readProgressSnapshot/);
  assert.match(runner, /readProgressHistoryCount/);
  assert.match(runner, /post-discovery progress integrity/);
  assert.match(runner, /guaranteed production cleanup/);
  assert.match(runner, /report privacy scan/);
  assert.doesNotMatch(runner, /createHotCommunityMessage/);
  assert.doesNotMatch(runner, /INSERT INTO community_messages/i);
  assert.doesNotMatch(runner, /INSERT INTO uploaded_resources/i);
  assert.doesNotMatch(runner, /INSERT INTO progress_events/i);
});

test("Phase 2 workflow carries both sessions, D1 and Cloudflare credentials and always uploads evidence", () => {
  for (const variable of ["SMOKE_MUTATION_AUTH_COOKIE", "SMOKE_MODERATOR_AUTH_COOKIE", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "PHASE2_D1_DATABASE"]) {
    assert.match(workflow, new RegExp(variable));
  }
  assert.match(workflow, /node --test tests\/phase2-fixture-discovery\.test\.mjs/);
  assert.match(workflow, /node scripts\/phase5\/fixture-discovery\.mjs/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /environment: v2-staging/);
});
