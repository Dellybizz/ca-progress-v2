import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root=process.cwd();
const read=(path)=>readFileSync(join(root,path),"utf8");

test("Phase 12 operations routes and APIs exist",()=>{
  for(const path of [
    "app/(admin)/admin/page.tsx","app/(admin)/admin/members/page.tsx","app/(admin)/admin/platform/page.tsx",
    "app/(admin)/admin/plans/page.tsx","app/(admin)/admin/content/page.tsx","app/(admin)/admin/notifications/page.tsx",
    "app/(admin)/admin/audit/page.tsx","app/(admin)/admin/icai-sync/page.tsx","app/(admin)/admin/community/moderation/page.tsx",
    "app/(admin)/admin/resources/moderation/page.tsx","app/api/admin/members/route.ts","app/api/admin/platform/route.ts",
    "app/api/admin/plans/route.ts","app/api/admin/content/route.ts","app/api/admin/notifications/route.ts","app/api/admin/audit/route.ts","app/api/admin/health/route.ts"
  ]) assert.equal(existsSync(join(root,path)),true,`${path} should exist`);
});

test("admin route group has loading, error and empty states",()=>{
  assert.equal(existsSync(join(root,"app/(admin)/admin/loading.tsx")),true);
  assert.equal(existsSync(join(root,"app/(admin)/admin/error.tsx")),true);
  assert.match(read("app/(admin)/admin/members/page.tsx"),/EmptyState/);
  assert.match(read("app/(admin)/admin/notifications/page.tsx"),/EmptyState/);
  assert.match(read("app/(admin)/admin/audit/page.tsx"),/EmptyState/);
});

test("operations UI has independent desktop tablet and mobile contracts",()=>{
  const css=read("app/styles/phase12.css");
  assert.match(css,/@media\(max-width:1100px\)/);
  assert.match(css,/@media\(max-width:680px\)/);
  assert.match(css,/@media\(max-width:420px\)/);
  assert.match(css,/\.phase12-table-wrap\{overflow:auto/);
  assert.match(css,/\.phase12-plan-admin-grid/);
  assert.match(css,/\.phase12-action-grid/);
});

test("mobile admin navigation exposes primary operations plus complete More sheet",()=>{
  const nav=read("components/shell/mobile-nav-placeholder.tsx");
  assert.match(nav,/adminPrimary/);
  assert.match(nav,/Overview/);
  assert.match(nav,/Members/);
  assert.match(nav,/Moderate/);
  assert.match(nav,/Platform/);
  assert.match(nav,/adminNavigation\.filter/);
  assert.match(nav,/Student workspace/);
});

test("admin overview visibly includes ICAI and Razorpay health",()=>{
  const page=read("app/(admin)/admin/page.tsx");
  assert.match(page,/Latest ICAI run/);
  assert.match(page,/Razorpay configuration/);
  assert.match(page,/health\.checks/);
});
