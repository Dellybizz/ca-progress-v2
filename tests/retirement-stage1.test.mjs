import test from "node:test";
import assert from "node:assert/strict";
import { evaluateStage1, sourceStateDigest } from "../scripts/phase5/retirement-stage1.mjs";
import { classifyRowFreshness, evaluatePostCutoverAudit } from "../scripts/phase5/post-cutover-source-audit.mjs";

function validInput() {
  return {
    sourceStability: {
      stable: true,
      beforeContentSha256: "a".repeat(64),
      afterContentSha256: "a".repeat(64),
    },
    sourceAudit: {
      status: "passed",
      baselineFinalDelta: { status: "reconciled", failureCount: 0, discrepancyCount: 0 },
      changedSinceFinalDeltaTables: ["dashboard_events", "profiles"],
      pendingSourceTables: [],
      summary: { sourceChangedSinceFinalDelta: 2, pendingSourceWrites: 0 },
      auth: { sourceAuthUserCount: 7, missingAppUsers: 0, missingSupabaseIdentities: 0 },
    },
    d1Health: {
      foreignKeyViolations: 0,
      counts: {
        app_users: 7,
        chapter_progress: 1,
        tasks: 0,
        goals: 0,
        user_calendar_events: 0,
        community_channels: 12,
        community_messages: 3,
        uploaded_resources: 1,
        subscription_plans: 3,
        user_subscriptions: 0,
        payment_orders: 0,
      },
    },
    liveMatrix: {
      status: "passed",
      summary: { passed: 84, failed: 0, unsupported: 1 },
      checks: [
        { name: "required", status: "passed", required: true },
        { name: "community message edit capability", status: "unsupported", required: false },
      ],
    },
    verificationClosure: { status: "passed", summary: { passed: 24, failed: 0 } },
    deployments: [{ id: "deployment-123", created_on: "2026-09-05T00:00:00Z", source: "upload" }],
    d1Bookmark: { bookmark: "00000091-00000012-000050dc-c12bb5bf9d1ac913ceff0ba33059b5e0" },
    secretNames: ["CA_AUTH_SESSION_SECRET", "R2_SECRET_ACCESS_KEY"],
    bindings: {
      bindingNames: ["DB", "USER_RESOURCES_R2", "ICAI_SYNC_SERVICE", "BILLING_SERVICE", "BACKGROUND_JOBS", "COMMUNITY_COORDINATORS"],
    },
    backup: {
      sha256: "b".repeat(64),
      authUserCount: 7,
      publicRecordCount: 1102,
      storageObjectCount: 0,
    },
    d1Backup: {
      sha256: "d".repeat(64),
      bytes: 1024,
    },
    durable: {
      verified: true,
      bucket: "ca-progress-v2-retirement-backups",
      objectKey: "stage1/test/baseline.tar.gz",
      archiveSha256: "c".repeat(64),
    },
    destructiveSupabaseActionsPerformed: false,
  };
}

test("source state digest ignores backup timestamp but changes with source data", () => {
  const first = {
    createdAt: "2026-09-05T00:00:00Z",
    authUsers: [{ id: "u1" }],
    tables: { profiles: [{ user_id: "u1", display_name: "A" }] },
    storageInventory: [],
  };
  const second = { ...first, createdAt: "2026-09-05T00:05:00Z" };
  assert.equal(sourceStateDigest(first), sourceStateDigest(second));
  second.tables = { profiles: [{ user_id: "u1", display_name: "B" }] };
  assert.notEqual(sourceStateDigest(first), sourceStateDigest(second));
});

test("post-cutover freshness treats a newer D1 row as authoritative", () => {
  const source = { id: "1", value: "old", updated_at: "2026-09-01T00:00:00Z" };
  const target = { id: "1", value: "new", updated_at: "2026-09-02T00:00:00Z" };
  assert.equal(classifyRowFreshness(source, target, ["id", "value", "updated_at"]), "d1_newer");
  assert.equal(classifyRowFreshness(target, source, ["id", "value", "updated_at"]), "source_newer");
});

test("post-cutover source audit accepts source changes only when D1 already absorbed them", () => {
  const report = {
    baselineFinalDelta: { status: "reconciled", failureCount: 0, discrepancyCount: 0 },
    changedSinceFinalDeltaTables: ["dashboard_events", "profiles"],
    pendingSourceTables: [],
    auth: { sourceAuthUserCount: 7, missingAppUsers: 0, missingSupabaseIdentities: 0 },
  };
  assert.equal(evaluatePostCutoverAudit(report).passed, true);
  report.pendingSourceTables = ["profiles"];
  assert.equal(evaluatePostCutoverAudit(report).passed, false);
});

test("Stage 1 accepts a clean Cloudflare-authoritative baseline", () => {
  const result = evaluateStage1(validInput());
  assert.equal(result.checks.filter((item) => item.status !== "passed").length, 0);
  assert.equal(result.rollbackCandidate?.deploymentId, "deployment-123");
  assert.ok(result.d1RollbackBookmark?.startsWith("00000091-"));
});

test("Stage 1 rejects source movement or pending source writes", () => {
  const input = validInput();
  input.sourceStability.afterContentSha256 = "e".repeat(64);
  input.sourceStability.stable = false;
  input.sourceAudit.pendingSourceTables = ["profiles"];
  input.sourceAudit.summary.pendingSourceWrites = 1;
  input.sourceAudit.status = "failed";
  const result = evaluateStage1(input);
  assert.equal(result.checks.find((item) => item.name === "Supabase source remained frozen during Stage 1")?.status, "failed");
  assert.equal(result.checks.find((item) => item.name === "No pending Supabase source write remains after cutover")?.status, "failed");
});

test("Stage 1 rejects D1 integrity or live-verification regressions", () => {
  const input = validInput();
  input.d1Health.foreignKeyViolations = 1;
  input.liveMatrix.summary.failed = 1;
  input.liveMatrix.status = "failed";
  input.liveMatrix.checks[0].status = "failed";
  input.verificationClosure.status = "failed";
  input.verificationClosure.summary.failed = 1;
  const result = evaluateStage1(input);
  assert.equal(result.checks.find((item) => item.name === "Production D1 foreign-key integrity")?.status, "failed");
  assert.equal(result.checks.find((item) => item.name === "Fresh authenticated production mutation matrix is green")?.status, "failed");
  assert.equal(result.checks.find((item) => item.name === "Fresh Phase 4 verification closure is green")?.status, "failed");
});

test("Stage 1 requires Worker/D1 rollback proof and both durable backups", () => {
  const input = validInput();
  input.deployments = [];
  input.d1Bookmark = {};
  input.d1Backup.bytes = 0;
  input.durable.verified = false;
  const result = evaluateStage1(input);
  assert.equal(result.checks.find((item) => item.name === "Production Worker rollback candidate recorded")?.status, "failed");
  assert.equal(result.checks.find((item) => item.name === "Production D1 Time Travel rollback bookmark recorded")?.status, "failed");
  assert.equal(result.checks.find((item) => item.name === "Current production D1 export is preserved in the retirement pack")?.status, "failed");
  assert.equal(result.checks.find((item) => item.name === "Final retirement backup is durably preserved in private R2")?.status, "failed");
});

test("Stage 1 requires representative D1 reads and preserves the Supabase freeze", () => {
  const input = validInput();
  delete input.d1Health.counts.community_messages;
  input.destructiveSupabaseActionsPerformed = true;
  const result = evaluateStage1(input);
  assert.equal(result.checks.find((item) => item.name === "Representative D1 domains are readable")?.status, "failed");
  assert.equal(result.checks.find((item) => item.name === "Destructive Supabase operations remain frozen")?.status, "failed");
});
