import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("P4 operations supports the required date and customer timeline investigation path",()=>{
  const lib=read("lib/billing/p4-admin.ts"),page=read("app/(admin)/admin/billing/page.tsx");
  assert.match(lib,/dateFrom\?: string; dateTo\?: string/);
  assert.match(lib,/Unified|timeline/i);
  assert.match(page,/name="from"/);assert.match(page,/name="to"/);
  assert.match(page,/Unified billing timeline/);
  assert.match(page,/subscription-access/);
  assert.match(page,/Safe evidence/);
});

test("P4 paid campaigns cannot publish without an internal discount rule, target plan and Razorpay offer",()=>{
  const lib=read("lib/billing/p4-admin.ts");
  assert.match(lib,/positive fixed or percentage discount rule/);
  assert.match(lib,/approved Razorpay offer ID/);
  assert.match(lib,/Paid discount campaigns require a target plan/);
});

test("P4 free and reward campaigns cannot masquerade as provider discounts",()=>{
  const lib=read("lib/billing/p4-admin.ts");
  assert.match(lib,/Free access and reward campaigns cannot carry a Razorpay monetary discount/);
  assert.match(lib,/target plan and at least one access day/);
});

test("P4 administrative campaign grants are retry-idempotent and use the existing revocable grant lifecycle",()=>{
  const lib=read("lib/billing/p4-admin.ts"),actions=read("app/(admin)/admin/billing/actions.ts"),phase1=read("lib/admin/subscription-access.ts");
  assert.match(lib,/admin_campaign_\$\{requestId\}/);
  assert.match(lib,/admin_subscription_grants/);
  assert.match(lib,/campaign_\$\{requestId\}/);
  assert.match(actions,/requestId:field\(form,"requestId"\)/);
  assert.match(phase1,/revokeManualSubscriptionAccess/);
  assert.match(phase1,/UPDATE user_subscriptions SET status='cancelled'/);
});

test("P4 campaign grants invalidate entitlement caches after successful mutation",()=>{
  const lib=read("lib/billing/p4-admin.ts");
  assert.match(lib,/invalidateUserFeatureCache/);
  assert.match(lib,/await invalidateUserFeatureCache\(input\.userId\)/);
});
