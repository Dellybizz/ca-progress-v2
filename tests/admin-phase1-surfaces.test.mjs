import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 1 replaces the fake admin preview with a real command center", () => {
  const page = read("app/(admin)/admin/page.tsx");
  assert.match(page, /requireAdminPageCapability\("admin\.dashboard\.read"\)/);
  assert.match(page, /getAdminCommandCenterMetrics/);
  assert.match(page, /\/admin\/users/);
  assert.match(page, /\/admin\/staff/);
  assert.match(page, /\/admin\/audit/);
  assert.doesNotMatch(page, /ProductPreviewPage|variant="admin"/);
});

test("Phase 1 user workspace is searchable, bounded and avoids private study content", () => {
  const page = read("app/(admin)/admin/users/page.tsx");
  const service = read("lib/admin/phase1.ts");
  assert.match(page, /requireAdminPageCapability\("users\.read"\)/);
  assert.match(page, /searchAdminUsers/);
  assert.match(service, /const USER_PAGE_SIZE = 40/);
  assert.match(service, /LIMIT \?\$\{query \? 2 : 1\} OFFSET/);
  assert.match(service, /auth_identities/);
  assert.match(service, /user_subscriptions/);
  assert.doesNotMatch(service, /SELECT \* FROM (notes|test_attempts|study_sessions)/);
  assert.doesNotMatch(page, /note_content|object_key|provider_subject/);
});

test("Phase 1 Staff & Roles is capability-governed and every role mutation is audited atomically", () => {
  const page = read("app/(admin)/admin/staff/page.tsx");
  const actions = read("app/(admin)/admin/staff/actions.ts");
  const service = read("lib/admin/phase1.ts");
  assert.match(page, /requireAdminPageCapability\("staff\.read"\)/);
  assert.match(actions, /requireAdminCapability\("staff\.manage"\)/);
  assert.match(service, /Self role changes are blocked/);
  assert.match(service, /Only a Parent Owner can grant Parent Owner/);
  assert.match(service, /Only a Parent Owner can change another Parent Owner/);
  assert.match(service, /db\.batch\(\[/);
  assert.match(service, /INSERT INTO admin_audit_events/);
  assert.match(service, /staff\.role\.change/);
  assert.match(service, /parent_owner\.manage/);
  assert.match(service, /staff\.manage/);
});

test("Phase 1 audit workspace reads only the immutable unified ledger", () => {
  const page = read("app/(admin)/admin/audit/page.tsx");
  const service = read("lib/admin/phase1.ts");
  assert.match(page, /requireAdminPageCapability\("audit\.read"\)/);
  assert.match(page, /listAdminAudit/);
  assert.match(page, /Rows cannot be updated or deleted/);
  assert.match(service, /FROM admin_audit_events/);
  assert.match(service, /ORDER BY created_at DESC,id DESC LIMIT/);
  assert.doesNotMatch(page, /delete|edit audit/i);
});

test("Phase 1 owner workspaces are discoverable in admin navigation", () => {
  const nav = read("components/shell/navigation.tsx");
  for (const href of ["/admin/users", "/admin/staff", "/admin/audit", "/admin/jobs"]) assert.ok(nav.includes(`href: "${href}"`), `${href} must be discoverable`);
  assert.match(nav, /Command Center/);
});
