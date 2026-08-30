import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migration = readFileSync(join(root, "supabase/migrations/20260831090000_phase12_operations_admin_platform.sql"), "utf8");

test("Phase 12 creates operations tables with RLS", () => {
  for (const table of ["admin_users", "admin_audit_logs", "feature_flags", "maintenance_settings", "notification_templates"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
});

test("operations tables are service-only and privileged functions are not browser executable", () => {
  assert.match(migration, /revoke all on public\.admin_users,public\.admin_audit_logs,public\.feature_flags,public\.maintenance_settings,public\.notification_templates from public,anon,authenticated/i);
  assert.match(migration, /grant select,insert on public\.admin_audit_logs to service_role/i);
  assert.match(migration, /revoke all on function public\.phase12_set_admin_role/i);
  assert.match(migration, /revoke all on function public\.phase12_list_members/i);
  assert.match(migration, /revoke all on function public\.phase12_update_plan/i);
});

test("role hierarchy and parent-owner protections are server-side", () => {
  assert.match(migration, /phase12_role_rank/i);
  assert.match(migration, /Self-demotion or self-role changes are not allowed/i);
  assert.match(migration, /The parent owner role is protected/i);
  assert.match(migration, /Operators cannot modify an equal or higher role/i);
  assert.match(migration, /Operators cannot grant an equal or higher role/i);
  assert.match(migration, /parent_owner cannot be assigned through the application/i);
});

test("privileged changes create immutable audit records", () => {
  assert.match(migration, /create trigger admin_audit_logs_immutable before update or delete/i);
  assert.match(migration, /Admin audit logs are immutable/i);
  for (const action of ["admin.role_changed", "admin.access_toggled", "platform.feature_flag_changed", "platform.maintenance_changed", "notifications.template_saved", "billing.plan_changed", "billing.entitlement_changed", "content.state_changed"]) {
    assert.ok(migration.includes(`'${action}'`), `${action} should be audited`);
  }
  assert.match(migration, /request_id uuid not null unique/i);
});

test("member directory is bounded and paginated in SQL", () => {
  assert.match(migration, /phase12_list_members/i);
  assert.match(migration, /p_limit integer default 25/i);
  assert.match(migration, /p_limit>100/i);
  assert.match(migration, /limit p_limit offset \(\(p_page-1\)\*p_limit\)/i);
  assert.match(migration, /count\(\*\) over\(\)/i);
});
