import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  KNOWN_NON_REQUIRED_UNSUPPORTED,
  MARKER_RESIDUE_TABLES,
  REQUIRED_CLOSURE_EVIDENCE,
  buildMarkerResidueQuery,
  evaluatePhase3Report,
} from "../scripts/phase5/verification-closure.mjs";

function validSource() {
  const evidence = REQUIRED_CLOSURE_EVIDENCE.map((name) => ({
    name,
    status: "passed",
    required: true,
    evidence: "ok",
  }));
  const unsupported = KNOWN_NON_REQUIRED_UNSUPPORTED.map((name) => ({
    name,
    status: "unsupported",
    required: false,
    evidence: "known product gap",
  }));
  const checks = [...evidence, ...unsupported];
  return {
    schemaVersion: 1,
    phase: "phase-3-mutation-auth-matrix",
    generatedAt: "2026-09-05T00:00:00.000Z",
    commit: "abc123",
    workflowRun: "12345",
    target: "https://ca-progress-v2.habeebaasif622.workers.dev",
    database: "ca-progress-v2-phase4-shadow",
    marker: "phase1-verification-12345",
    status: "passed",
    summary: {
      passed: evidence.length,
      failed: 0,
      unsupported: unsupported.length,
    },
    checks,
  };
}

function context() {
  return {
    expectedCommit: "abc123",
    expectedRun: "12345",
    expectedTarget: "https://ca-progress-v2.habeebaasif622.workers.dev",
    expectedDatabase: "ca-progress-v2-phase4-shadow",
    expectedBranch: "phase-12-operations-admin-platform",
    actualBranch: "phase-12-operations-admin-platform",
  };
}

test("Phase 4 accepts only a fully reconciled green Phase 3 report", () => {
  const checks = evaluatePhase3Report(validSource(), context());
  assert.equal(checks.filter((check) => check.status !== "passed").length, 0);
});

test("Phase 4 rejects required failures even if the source status is forged green", () => {
  const source = validSource();
  source.checks[0] = { ...source.checks[0], status: "failed" };
  source.summary = { ...source.summary, passed: source.summary.passed - 1, failed: 1 };
  const checks = evaluatePhase3Report(source, context());
  assert.equal(checks.find((check) => check.name === "phase 3 required checks all passed")?.status, "failed");
  assert.equal(checks.find((check) => check.name === "phase 3 closure evidence coverage")?.status, "failed");
});

test("Phase 4 rejects unknown or required unsupported checks", () => {
  const source = validSource();
  source.checks.push({
    name: "new silent gap",
    status: "unsupported",
    required: false,
    evidence: "unexpected",
  });
  source.summary.unsupported += 1;
  const checks = evaluatePhase3Report(source, context());
  assert.equal(checks.find((check) => check.name === "phase 3 unsupported capability allowlist")?.status, "failed");
});

test("Phase 4 binds evidence to the same commit, run, target, database and branch", () => {
  const checks = evaluatePhase3Report(validSource(), {
    ...context(),
    expectedCommit: "different",
    actualBranch: "main",
  });
  assert.equal(checks.find((check) => check.name === "phase 3 report commit matches closure commit")?.status, "failed");
  assert.equal(checks.find((check) => check.name === "phase 4 branch guard")?.status, "failed");
});

test("marker residue query is read-only, exact-run scoped and covers every touched table", () => {
  assert.deepEqual(MARKER_RESIDUE_TABLES, [
    "community_messages",
    "message_reports",
    "moderation_actions",
    "notes",
    "resource_moderation",
    "r2_upload_intents",
    "uploaded_resources",
    "tasks",
    "goals",
    "user_calendar_events",
  ]);
  const query = buildMarkerResidueQuery("notes", ["title", "body_html"], "phase1-verification-12345");
  assert.match(query, /^SELECT COUNT\(\*\) AS n FROM "notes" WHERE /);
  assert.match(query, /phase1-verification-12345/);
  assert.doesNotMatch(query, /\bDELETE\b|\bUPDATE\b|\bINSERT\b/i);
});

test("resource deletion regression contract deletes R2 before D1 metadata", async () => {
  const source = await readFile("app/api/resources/[id]/route.ts", "utf8");
  const cloudflareDelete = source.indexOf("await bucket.delete(found.storage_path)");
  const metadataDelete = source.indexOf("await deleteHotResource(id, identity.id)");
  assert.ok(cloudflareDelete >= 0, "Cloudflare DELETE path must delete the R2 object");
  assert.ok(metadataDelete > cloudflareDelete, "R2 deletion must happen before canonical D1 metadata deletion");
});

test("Phase 4 workflow runs static gates, a fresh live Phase 3 matrix and closure evaluation", async () => {
  const workflow = await readFile(".github/workflows/phase4-verification-closure.yml", "utf8");
  for (const fragment of [
    "npm run typecheck",
    "npm run lint",
    "tests/phase3-mutation-matrix.test.mjs",
    "tests/phase4-verification-closure.test.mjs",
    "node scripts/phase5/mutation-matrix.mjs",
    "node scripts/phase5/verification-closure.mjs",
    "phase4-verification-closure-${{ github.run_id }}",
  ]) {
    assert.ok(workflow.includes(fragment), `workflow missing ${fragment}`);
  }
});
