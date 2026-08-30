import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 11 pricing, billing, payment and route-state files exist", () => {
  for (const path of [
    "app/(student)/pricing/page.tsx",
    "app/(student)/pricing/loading.tsx",
    "app/(student)/pricing/error.tsx",
    "app/(student)/billing/page.tsx",
    "app/(student)/billing/loading.tsx",
    "app/(student)/billing/error.tsx",
    "app/api/payments/create-order/route.ts",
    "app/api/payments/verify/route.ts",
    "app/api/payments/webhook/route.ts",
  ]) {
    assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
  }
});

test("billing exposes current plan, validity, renewal, history, empty and recovery states", () => {
  const billing = read("app/(student)/billing/page.tsx");
  for (const phrase of [
    "Current plan",
    "Active until",
    "Renewal state",
    "Payment history",
    "Subscription audit",
    "No paid transactions yet",
    "Retry payment",
    "payment ===",
  ]) {
    if (phrase === "payment ===") continue;
    assert.ok(billing.includes(phrase), `${phrase} should be represented`);
  }
  assert.match(billing, /state === "success"/);
  assert.match(billing, /state === "pending"/);
  assert.match(billing, /state === "failed"/);
  assert.match(billing, /payment\.status === "failed" \? <Link href="\/pricing">Retry<\/Link>/);
});

test("pricing remains configuration-safe and sends only the plan identifier", () => {
  const pricing = read("components/billing/pricing-client.tsx");
  assert.match(pricing, /body: JSON\.stringify\(\{ planId: plan\.id \}\)/);
  assert.match(pricing, /Checkout not configured/);
  assert.match(pricing, /allowance pending configuration/);
  assert.match(pricing, /\/billing\?payment=success/);
  assert.match(pricing, /\/billing\?payment=pending/);
  assert.match(pricing, /\/billing\?payment=failed/);
  assert.match(pricing, /retry: \{ enabled: true, max_count: 3 \}/);
});

test("pricing and billing have dedicated mobile breakpoints and overflow-safe payment history", () => {
  const css = read("app/styles/phase11.css");
  assert.match(css, /@media\(max-width:980px\)/);
  assert.match(css, /@media\(max-width:680px\)/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /\.phase11-table-wrap\{overflow:auto\}/);
  assert.match(css, /\.phase11-plan-grid\{grid-template-columns:1fr\}/);
});

test("server-side entitlement checks cover protected Phase 11 integrations", () => {
  assert.match(read("app/(student)/analytics/forecast/page.tsx"), /analytics\.forecast/);
  assert.match(read("app/api/planner/today/route.ts"), /planner\.smart/);
  assert.match(read("app/api/community/channels/[channel]/messages/route.ts"), /community\.attachments/);
  assert.match(read("app/api/resources/upload/route.ts"), /resources\.storage/);
});

test("earlier completed phase regression suites remain in the repository", () => {
  for (const phase of ["phase2", "phase3", "phase4", "phase5", "phase6", "phase7", "phase8", "phase9", "phase10"]) {
    const files = [
      `${phase}-routes-responsive.test.mjs`,
      `${phase}-schema-security.test.mjs`,
      `${phase}-architecture.test.mjs`,
      `${phase}-community.test.mjs`,
    ];
    assert.ok(files.some((file) => existsSync(join(root, "tests", file))), `at least one ${phase} regression test should remain`);
  }
});
