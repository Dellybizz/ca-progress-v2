import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capabilitiesForRole, hasAdminCapability, hasAnyAdminCapability } from "../lib/authorization/capabilities.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 1 role/capability matrix is explicit and financial settlement is owner-only", () => {
  assert.equal(hasAnyAdminCapability("student"), false);
  assert.equal(hasAdminCapability("moderator", "community.moderate"), true);
  assert.equal(hasAdminCapability("moderator", "resources.moderate"), true);
  assert.equal(hasAdminCapability("moderator", "gamification.review"), true);
  assert.equal(hasAdminCapability("moderator", "icai.run"), false);
  assert.equal(hasAdminCapability("moderator", "rewards.settle"), false);
  assert.equal(hasAdminCapability("admin", "rewards.settle"), false);
  assert.equal(hasAdminCapability("owner", "rewards.settle"), true);
  assert.equal(hasAdminCapability("parent_owner", "rewards.settle"), true);
  assert.equal(hasAdminCapability("owner", "parent_owner.manage"), false);
  assert.equal(hasAdminCapability("parent_owner", "parent_owner.manage"), true);
  assert.ok(capabilitiesForRole("admin").includes("audit.read"));
});

test("central admin layout rejects non-admin-capable viewers before page loaders", () => {
  const layout = read("app/(admin)/layout.tsx");
  assert.match(layout, /requireAdminAreaPageAccess/);
  assert.match(layout, /await requireAdminAreaPageAccess\(\)/);
});

test("each current admin page declares its minimum capability", () => {
  const expectations = new Map([
    ["app/(admin)/admin/page.tsx", "admin.dashboard.read"],
    ["app/(admin)/admin/community/moderation/page.tsx", "community.moderate"],
    ["app/(admin)/admin/resources/moderation/page.tsx", "resources.moderate"],
    ["app/(admin)/admin/icai-sync/page.tsx", "icai.read"],
    ["app/(admin)/admin/jobs/page.tsx", "jobs.read"],
    ["app/(admin)/admin/syllabus/page.tsx", "academic.read"],
  ]);
  for (const [path, capability] of expectations) {
    const source = read(path);
    assert.match(source, /requireAdminPageCapability/);
    assert.ok(source.includes(`requireAdminPageCapability("${capability}")`), `${path} must guard ${capability}`);
  }
});

test("all current admin API surfaces use named capabilities and mutation surfaces use unified audit", () => {
  const mutationRoutes = [
    "app/api/admin/community/moderation/route.ts",
    "app/api/admin/community/verifications/route.ts",
    "app/api/admin/resources/moderation/route.ts",
    "app/api/admin/gamification/route.ts",
  ];
  for (const path of mutationRoutes) {
    const source = read(path);
    assert.match(source, /requireAdminCapability/);
    assert.match(source, /recordAdminAuditEvent/);
  }
  assert.match(read("app/api/admin/icai-sync/status/route.ts"), /requireAdminCapability\("icai\.read"\)/);
  assert.match(read("app/api/admin/jobs/route.ts"), /requireAdminCapability\("jobs\.read"\)/);
  const gamification = read("app/api/admin/gamification/route.ts");
  assert.match(gamification, /authorized\("rewards\.settle"\)/);
  assert.doesNotMatch(gamification, /isPrivilegedRole/);
});

test("ICAI privileged server actions use named capability checks and unified audit", () => {
  const actions = read("app/(admin)/admin/icai-sync/actions.ts");
  assert.match(actions, /requireAdminCapability\("icai\.run"\)/);
  assert.match(actions, /requireAdminCapability\("icai\.review"\)/);
  assert.match(actions, /recordAdminAuditEvent/);
  assert.doesNotMatch(actions, /requireAdminOperator/);
});

test("unified admin audit ledger is append-only and preserves historical actor identity", () => {
  const migration = read("d1/migrations/0027_admin_phase1_security.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS admin_audit_events/);
  assert.match(migration, /actor_user_id TEXT NOT NULL/);
  assert.doesNotMatch(migration, /actor_user_id TEXT NOT NULL REFERENCES app_users/);
  assert.match(migration, /capability/);
  assert.match(migration, /trace_id/);
  assert.match(migration, /previous_value/);
  assert.match(migration, /new_value/);
  assert.match(migration, /BEFORE UPDATE ON admin_audit_events/);
  assert.match(migration, /BEFORE DELETE ON admin_audit_events/);
});
