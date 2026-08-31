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
  assert.match(legacy,/getAdminRoleForUser\(userId\)/);
  assert.match(legacy,/freshRole \?\? "student"/);
  assert.match(legacy,/Compatibility only before the Phase 12 migration\/server credential is available/);
  assert.match(legacy,/getClaims\(\)/);
});

test("role-changing and platform-commercial mutations require owner level",()=>{
  assert.match(read("app/api/admin/members/route.ts"),/requireAdminOperator\("owner"\)/);
  assert.match(read("app/api/admin/platform/route.ts"),/requireAdminOperator\("owner"\)/);
  assert.match(read("app/api/admin/plans/route.ts"),/requireAdminOperator\("owner"\)/);
});

test("member APIs paginate and filter through the isolated admin worker RPC",()=>{
  const worker=read("workers/admin-ops/index.ts");
  const route=read("app/api/admin/members/route.ts");
  assert.match(worker,/phase12_list_members/);
  assert.match(worker,/p_limit: limit/);
  assert.match(worker,/Math\.min\(parsed, max\)/);
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

test("health probes run in the isolated admin worker",()=>{
  const worker=read("workers/admin-ops/index.ts");
  assert.match(worker,/\/auth\/v1\/health/);
  assert.match(worker,/USER_RESOURCES_R2/);
  assert.match(worker,/phase12_realtime_health/);
  assert.match(worker,/BILLING_SERVICE/);
  assert.match(worker,/icai_sync_runs/);
  assert.match(worker,/payment_events/);
});

test("admin backend stays isolated through the consolidated Next worker and private Admin Ops service",()=>{
  const bridge=read("lib/admin/service.ts");
  const worker=read("workers/admin-ops/index.ts");
  const web=read("wrangler.web.jsonc");
  const adminOps=read("workers/admin-ops/wrangler.jsonc");
  const pkg=read("package.json");
  assert.match(bridge,/ADMIN_OPS_SERVICE/);
  assert.match(bridge,/admin-ops\.internal/);
  assert.doesNotMatch(bridge,/invokeBillingService|getResourceR2Bucket|phase12_list_members/);
  assert.match(worker,/x-ca-progress-internal/);
  assert.match(worker,/admin_users\?user_id=eq\./);
  assert.match(worker,/is_active=eq\.true/);
  assert.match(web,/"ADMIN_OPS_SERVICE"/);
  assert.match(web,/"ca-progress-v2-admin-ops"/);
  assert.doesNotMatch(web,/ADMIN_WEB_SERVICE|ca-progress-v2-web-admin/);
  assert.match(adminOps,/"name"\s*:\s*"ca-progress-v2-admin-ops"/);
  assert.match(adminOps,/"workers_dev"\s*:\s*false/);
  assert.match(pkg,/cf:deploy:admin/);
  assert.match(pkg,/cf:check:admin/);
});

test("earlier Phase 11 payment authority remains intact",()=>{
  const create=read("workers/billing/index.ts");
  assert.match(create,/subscription_plans\?id=eq\./);
  assert.match(create,/price_subunits/);
  assert.match(create,/phase11_reconcile_payment/);
});
