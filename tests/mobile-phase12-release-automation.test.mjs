import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

test("Phase 12 publishes a hosted release contract with bounded native compatibility", () => {
  const contract = read("config/app-release.ts");
  const gate = read("components/mobile/native-update-gate.tsx");
  assert.match(contract, /schemaVersion: 2/);
  assert.match(contract, /updateMode: "hosted"/);
  assert.match(contract, /minimumSupported: 1, recommended: 1/);
  assert.match(gate, /App\.addListener\("resume"/);
  assert.match(gate, /status === "required"/);
  assert.match(gate, /aria-modal="true"/);
});

test("account deletion is queued, idempotent and records bounded retention", () => {
  const processor = read("lib/account-deletion/processor.ts");
  const worker = read("custom-worker.ts");
  const migration = read("d1/migrations/0063_mobile_phase12_release_operations.sql");
  assert.match(worker, /account-deletion-scan/);
  assert.match(worker, /account-deletion-process/);
  assert.match(processor, /scheduled_for<=CURRENT_TIMESTAMP/);
  assert.match(processor, /getResourceR2Bucket/);
  assert.match(processor, /account_state='deleted'/);
  assert.match(processor, /status='completed'/);
  assert.match(migration, /account_deletion_receipts/);
  assert.match(migration, /payment.*tax.*fraud_prevention.*immutable_audit/);
});

test("signed builds fail closed and never auto-submit production", () => {
  const workflow = read(".github/workflows/mobile-release.yml");
  const validator = read("scripts/mobile/validate-release-env.mjs");
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /bundleRelease/);
  assert.match(workflow, /xcodebuild/);
  assert.doesNotMatch(workflow, /play_action|pilot upload|deliver --submit/);
  assert.match(validator, /Missing.*release secrets/);
});

test("native store assets are branded and submission evidence is explicit", () => {
  for (const path of [
    "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
    "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
    "docs/mobile/store/DEVICE_TEST_MATRIX.md",
    "docs/mobile/store/ROLLOUT_AND_ROLLBACK.md",
  ]) assert.ok(existsSync(join(process.cwd(), path)), `${path} must exist`);
  assert.match(read("docs/mobile/store/DEVICE_TEST_MATRIX.md"), /Android internal track/);
  assert.match(read("docs/mobile/store/DEVICE_TEST_MATRIX.md"), /iOS TestFlight/);
  assert.match(read("docs/mobile/store/ROLLOUT_AND_ROLLBACK.md"), /Cloudflare deployment rollback/);
});

test("the mobile branch participates in CI and automatic Cloudflare deployment", () => {
  assert.match(read(".github/workflows/ci.yml"), /mobile-phase7-student-parity/);
  assert.match(read(".github/workflows/deploy-staging.yml"), /branches: \[phase-12-operations-admin-platform, hotfix\/dark-mode-ae0cb36d, mobile-phase7-student-parity\]/);
});
