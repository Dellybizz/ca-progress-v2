import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root=process.cwd();
const read=(path)=>readFileSync(join(root,path),"utf8");

test("every new admin API re-authorizes on the server",()=>{
  const routes=["members","platform","plans","notifications","audit","content","health"];
  for(const route of routes){
    const src=read(`app/api/admin/${route}/route.ts`);
    assert.match(src,/requireAdminOperator\(/,`${route} must authorize server-side`);
    assert.doesNotMatch(src,/localStorage|sessionStorage/,`${route} must not trust browser role state`);
  }
});

test("central authorization reads fresh admin_users state and existing admin helpers consult it first",()=>{
  const central=read("lib/admin/authorization.ts");
  const legacy=read("lib/authorization/server.ts");
  assert.match(central,/admin_users\?user_id=eq\./);
  assert.match(central,/is_active=eq\.true/);
  assert.match(central,/roleRank/);
  assert.match(legacy,/getAdminRoleForUser\(user\.id\)/);
  assert.match(legacy,/freshRole \?\? "student"/);
  assert.match(legacy,/Compatibility only while the Phase 12 migration is not yet present\/configured/);
});

test("role-changing and platform-commercial mutations require owner level",()=>{
  assert.match(read("app/api/admin/members/route.ts"),/requireAdminOperator\("owner"\)/);
  assert.match(read("app/api/admin/platform/route.ts"),/requireAdminOperator\("owner"\)/);
  assert.match(read("app/api/admin/plans/route.ts"),/requireAdminOperator\("owner"\)/);
});

test("member APIs paginate and filter through the server RPC",()=>{
  const service=read("lib/admin/service.ts");
  const route=read("app/api/admin/members/route.ts");
  assert.match(service,/phase12_list_members/);
  assert.match(route,/Math\.min\(100/);
  assert.match(route,/searchParams\.get\("page"\)/);
  assert.match(route,/searchParams\.get\("q"\)/);
  assert.match(route,/searchParams\.get\("role"\)/);
});

test("feature switches and maintenance are enforced on real server mutation paths",()=>{
  const checks=[
    ["app/api/payments/create-order/route.ts","billing.checkout"],
    ["app/api/planner/today/route.ts","planner.smart"],
    ["app/api/community/channels/[channel]/messages/route.ts","community.write"],
    ["app/api/resources/upload/route.ts","resources.upload"],
    ["app/(admin)/admin/icai-sync/actions.ts","icai.sync"],
  ];
  for(const [path,key] of checks){ const src=read(path); assert.match(src,/assertOperationalMutationAllowed/); assert.ok(src.includes(`"${key}"`)); }
  const operations=read("lib/admin/operations.ts");
  assert.match(operations,/MAINTENANCE_MODE/);
  assert.match(operations,/FEATURE_DISABLED/);
  assert.match(operations,/getAdminRoleForUser/);
});

test("health service probes auth storage realtime Razorpay and ICAI state",()=>{
  const service=read("lib/admin/service.ts");
  assert.match(service,/\/auth\/v1\/health/);
  assert.match(service,/getResourceR2Bucket/);
  assert.match(service,/phase12_realtime_health/);
  assert.match(service,/invokeBillingService\(\{ path: "\/health"/);
  assert.match(service,/icai_sync_runs/);
  assert.match(service,/payment_events/);
});

test("earlier Phase 11 payment authority remains intact",()=>{
  const create=read("workers/billing/index.ts");
  assert.match(create,/subscription_plans\?id=eq\./);
  assert.match(create,/price_subunits/);
  assert.match(create,/phase11_reconcile_payment/);
});
