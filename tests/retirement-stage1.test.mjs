import test from "node:test";
import assert from "node:assert/strict";
import { evaluateStage1, sourceStateDigest } from "../scripts/phase5/retirement-stage1.mjs";

function validInput() {
  return {
    sourceStability: {
      stable: true,
      beforeContentSha256: "a".repeat(64),
      afterContentSha256: "a".repeat(64),
    },
    reconciliation: {
      status: "reconciled",
      failures: [],
      discrepancies: [],
      foreignKeyViolations: 0,
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
    deployments: [{ id: "deployment-123", created_on: "2026-09-05T00:00:00Z", source: "upload" }],
    secretNames: ["CA_AUTH_SESSION_SECRET", "R2_SECRET_ACCESS_KEY"],
    bindings: {
      bindingNames: ["DB", "USER_RESOURCES_R2", "ICAI_SYNC_SERVICE", "BILLING_SERVICE", "BACKGROUND_JOBS", "COMMUNITY_COORDINATORS"],
    },
    backup: {
      sha256: "b".repeat(64),
      authUserCount: 7,
      publicRecordCount: 1098,
      storageObjectCount: 0,
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

test("Stage 1 accepts a clean frozen baseline", () => {
  const result = evaluateStage1(validInput());
  assert.equal(result.checks.filter((item) => item.status !== "passed").length, 0);
  assert.equal(result.rollbackCandidate?.deploymentId, "deployment-123");
});

test("Stage 1 rejects source movement during final delta", () => {
  const input = validInput();
  input.sourceStability.afterContentSha256 = "d".repeat(64);
  const result = evaluateStage1(input);
  assert.equal(result.checks.find((item) => item.name.includes("source remained frozen"))?.status, "failed");
});

test("Stage 1 rejects reconciliation discrepancies or D1 FK violations", () => {
  const input = validInput();
  input.reconciliation.discrepancies = [{ table: "profiles" }];
  input.d1Health.foreignKeyViolations = 1;
  const result = evaluateStage1(input);
  assert.equal(result.checks.find((item) => item.name === "Final source to D1 reconciliation is clean")?.status, "failed");
  assert.equal(result.checks.find((item) => item.name === "Production D1 foreign-key integrity")?.status, "failed");
});

test("Stage 1 rejects a missing rollback deployment or durable backup proof", () => {
  const input = validInput();
  input.deployments = [];
  input.durable.verified = false;
  const result = evaluateStage1(input);
  assert.equal(result.checks.find((item) => item.name === "Production Worker rollback candidate recorded")?.status, "failed");
  assert.equal(result.checks.find((item) => item.name === "Final backup is durably preserved in private R2")?.status, "failed");
});

test("Stage 1 requires representative D1 domain reads and non-destructive source policy", () => {
  const input = validInput();
  delete input.d1Health.counts.community_messages;
  input.destructiveSupabaseActionsPerformed = true;
  const result = evaluateStage1(input);
  assert.equal(result.checks.find((item) => item.name === "Representative D1 domains are readable")?.status, "failed");
  assert.equal(result.checks.find((item) => item.name === "Destructive Supabase operations remain frozen")?.status, "failed");
});
