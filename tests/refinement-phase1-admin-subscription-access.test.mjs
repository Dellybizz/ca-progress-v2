import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("Phase 1 admin navigation follows the operational information architecture",()=>{
  const nav=read("components/shell/navigation-contract.ts");
  for(const section of ["Operations","Users","Billing","Content","ICAI Sync","Moderation","System","Audit"])assert.ok(nav.includes(`label: "${section}"`),`${section} section missing`);
});

test("user search drills into a privacy-scoped user and subscription workspace",()=>{
  const list=read("app/(admin)/admin/users/page.tsx"),detail=read("app/(admin)/admin/users/[userId]/page.tsx"),access=read("app/(admin)/admin/users/[userId]/subscription-access/page.tsx");
  assert.match(list,/\/admin\/users\/\$\{encodeURIComponent\(user\.userId\)\}/);
  assert.match(detail,/getAdminUserById/);assert.match(detail,/getUserSubscriptionAccess/);
  assert.match(access,/requireAdminPageCapability\("billing\.read"\)/);
  assert.match(access,/Precedence: paid subscription/);
  assert.doesNotMatch(detail,/note_content|provider_subject|object_key/);
});

test("manual access is a distinct idempotent record and never fabricates payment data",()=>{
  const migration=read("d1/migrations/0049_refinement_phase1_admin_subscription_access.sql"),service=read("lib/admin/subscription-access.ts"),runner=read("scripts/apply-retained-d1-migrations.mjs");
  assert.match(migration,/CREATE TABLE IF NOT EXISTS admin_subscription_grants/);
  assert.match(migration,/idempotency_key TEXT NOT NULL UNIQUE/);
  assert.match(service,/source,created_at,updated_at\) VALUES\([^\n]+,'manual'/);
  assert.match(service,/subscription_policy_contracts/);
  assert.doesNotMatch(service,/INSERT INTO payment_(orders|events)/);
  assert.match(runner,/0049_refinement_phase1_admin_subscription_access/);
});

test("grant, expiry and revoke operations are owner-confirmed and atomically audited",()=>{
  const actions=read("app/(admin)/admin/users/[userId]/subscription-access/actions.ts"),service=read("lib/admin/subscription-access.ts"),page=read("app/(admin)/admin/users/[userId]/subscription-access/page.tsx");
  assert.match(actions,/requireAdminCapability\("billing\.manage"\)/);
  assert.match(service,/\['owner','parent_owner'\]/);
  assert.match(service,/Review and confirm/);
  assert.match(service,/subscription\.manual\.grant/);assert.match(service,/subscription\.manual\.expiry\.change/);assert.match(service,/subscription\.manual\.revoke/);
  assert.match(service,/db\.batch\(\[/);assert.match(service,/INSERT INTO admin_audit_events/);
  assert.match(page,/name="confirmed" required/);
});
