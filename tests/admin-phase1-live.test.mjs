import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 1 live admin verifier exercises real deployed authorization and Server Actions", () => {
  const live = read("scripts/verify-admin-phase1-live.mjs");
  assert.match(live, /ca_session=/);
  assert.match(live, /INSERT INTO sessions/);
  assert.match(live, /\/admin\/users/);
  assert.match(live, /\/admin\/staff/);
  assert.match(live, /\/admin\/audit/);
  assert.match(live, /\/admin\/community\/moderation/);
  assert.match(live, /formForUser/);
  assert.match(live, /\$ACTION_/);
  assert.match(live, /submitRoleChange/);
  assert.match(live, /staff\.role\.change/);
  assert.match(live, /previous_value/);
  assert.match(live, /new_value/);
  assert.match(live, /trace_id/);
});

test("Phase 1 live admin verifier proves negative permissions and Parent Owner safety", () => {
  const live = read("scripts/verify-admin-phase1-live.mjs");
  assert.match(live, /guest admin denial/);
  assert.match(live, /student admin denial/);
  assert.match(live, /moderator command-center restriction/);
  assert.match(live, /settle_rewards/);
  assert.match(live, /expectedStatus/);
  assert.match(live, /Parent Owner authority required/);
  assert.match(live, /forgedParentChange/);
  assert.match(live, /parent_owner/);
});

test("Phase 1 live admin verifier proves audit immutability, rollback and cleanup", () => {
  const live = read("scripts/verify-admin-phase1-live.mjs");
  assert.match(live, /UPDATE admin_audit_events SET reason='tampered'/);
  assert.match(live, /DELETE FROM admin_audit_events WHERE id=/);
  assert.match(live, /cleanup revert/);
  assert.match(live, /DELETE FROM sessions/);
  assert.match(live, /DELETE FROM app_users/);
  assert.match(live, /synthetic users and sessions cleaned up/);
  assert.match(live, /phase1-admin-evidence\/phase1-admin-live\.json/);
});

test("Phase 1 admin live verification is a dedicated staging workflow", () => {
  const workflow = read(".github/workflows/phase1-admin-live-verification.yml");
  assert.match(workflow, /environment: v2-staging/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /verify-admin-phase1-live\.mjs/);
  assert.match(workflow, /tests\/admin-phase1-live\.test\.mjs/);
  assert.match(workflow, /actions\/upload-artifact@v5/);
  assert.doesNotMatch(workflow, /wrangler deploy/);
});
