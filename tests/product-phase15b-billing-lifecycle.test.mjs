import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { subscriptionAccessState, hasSubscriptionAccess } from "../lib/billing/lifecycle.mjs";

const root = process.cwd();
const source = (path) => readFileSync(`${root}/${path}`, "utf8");
const now = new Date("2026-09-07T12:00:00.000Z");
const started = "2026-09-01T00:00:00.000Z";
const future = "2026-09-30T00:00:00.000Z";
const past = "2026-09-06T00:00:00.000Z";

test("Phase 15B lifecycle keeps active subscriptions only within their term", () => {
  assert.equal(hasSubscriptionAccess({ status: "active", starts_at: started, ends_at: null }, now), true);
  assert.equal(hasSubscriptionAccess({ status: "active", starts_at: started, ends_at: future }, now), true);
  assert.deepEqual(subscriptionAccessState({ status: "active", starts_at: started, ends_at: past }, now), {
    entitled: false,
    reason: "term_ended",
    paidThrough: past,
  });
  assert.equal(hasSubscriptionAccess({ status: "active", starts_at: "2026-10-01T00:00:00.000Z", ends_at: null }, now), false);
});

test("Phase 15B cancellation honors paid-through without granting unbounded access", () => {
  assert.deepEqual(subscriptionAccessState({ status: "cancelled", starts_at: started, ends_at: future }, now), {
    entitled: true,
    reason: "cancelled_paid_through",
    paidThrough: future,
  });
  assert.equal(hasSubscriptionAccess({ status: "cancelled", starts_at: started, ends_at: past }, now), false);
  assert.equal(hasSubscriptionAccess({ status: "cancelled", starts_at: started, ends_at: null }, now), false);
  assert.equal(hasSubscriptionAccess({ status: "cancelled", starts_at: started, ends_at: "invalid" }, now), false);
});

test("Phase 15B paused subscriptions use a bounded grace period", () => {
  assert.deepEqual(subscriptionAccessState({ status: "paused", starts_at: started, ends_at: future }, now), {
    entitled: true,
    reason: "grace_period",
    paidThrough: future,
  });
  assert.equal(hasSubscriptionAccess({ status: "paused", starts_at: started, ends_at: past }, now), false);
  assert.equal(hasSubscriptionAccess({ status: "paused", starts_at: started, ends_at: null }, now), false);
  assert.equal(hasSubscriptionAccess({ status: "expired", starts_at: started, ends_at: future }, now), false);
  assert.equal(hasSubscriptionAccess({ status: "unexpected", starts_at: started, ends_at: future }, now), false);
});

test("web billing model applies the lifecycle resolver instead of active-only filtering", () => {
  const billing = source("lib/billing/service.ts");
  assert.match(billing, /import \{ hasSubscriptionAccess \} from "\.\/lifecycle\.mjs"/);
  assert.match(billing, /select\("plan_id,status,ends_at,starts_at"\)/);
  assert.match(billing, /find\(\(item\) => hasSubscriptionAccess\(item, now\)\)/);
  assert.doesNotMatch(billing, /select\("plan_id,ends_at,starts_at"\).*\.eq\("status", "active"\)/s);
});

test("billing Worker enforces paid-through and grace lifecycle server-side", () => {
  const worker = source("workers/billing/index.ts");
  assert.match(worker, /status IN \('cancelled','paused'\) AND ends_at IS NOT NULL AND ends_at>\?2/);
  assert.match(worker, /status='active' AND \(ends_at IS NULL OR ends_at>\?2\)/);
  assert.match(worker, /UPDATE user_subscriptions SET status='active',ends_at=/);
  assert.match(worker, /status IN \('cancelled','paused'\) AND ends_at>\?3/);
});

test("upload authorization atomically reserves committed plus in-flight bytes", () => {
  const route = source("app/api/resources/upload-url/route.ts");
  assert.match(route, /INSERT INTO r2_upload_intents[\s\S]*SELECT \?1,\?2,\?3,\?4,\?5,\?6,\?7,\?8/);
  assert.match(route, /SELECT SUM\(size_bytes\) FROM uploaded_resources WHERE owner_user_id=\?2/);
  assert.match(route, /SELECT SUM\(expected_size_bytes\) FROM r2_upload_intents WHERE user_id=\?2 AND status='issued' AND expires_at>\?9/);
  assert.match(route, /\+ \?6[\s\S]*\) <= \?10/);
  assert.match(route, /reservation\.meta\?\.changes/);
  assert.match(route, /optionalUser\(\)/);
  assert.match(route, /getResourceStorageAccess\(identity\.id\)/);
  assert.doesNotMatch(route, /body\?\.(?:userId|user_id|ownerUserId|owner_user_id)/);
});

test("upload completion independently rechecks the current plan and quota", () => {
  const route = source("app/api/resources/upload-complete/route.ts");
  assert.match(route, /getResourceStorageAccess\(identity\.id\)/);
  assert.match(route, /access\.usedBytes \+ Number\(intent\.expected_size_bytes\) > access\.limitBytes/);
  assert.match(route, /bucket\.delete\(String\(intent\.object_key\)\)/);
  assert.match(route, /UPDATE r2_upload_intents SET status='failed'/);
  assert.match(route, /createResourceMetadataWithinQuota\(/);
});

test("downgrade UX promises preservation while blocking only new uploads over limit", () => {
  const settings = source("app/(student)/settings/page.tsx");
  assert.match(settings, /Downgrading never deletes your existing files\./);
  assert.match(settings, /existing files stay available, but new uploads pause until you reduce usage or upgrade\./);
  assert.match(settings, /Cancelled — paid access remains active through/);
  assert.match(settings, /Billing grace period — paid access remains active through/);
  assert.match(settings, /Free, Pro and Premium/);

  const billing = source("lib/billing/service.ts");
  const worker = source("workers/billing/index.ts");
  assert.doesNotMatch(billing, /DELETE FROM uploaded_resources/i);
  assert.doesNotMatch(worker, /DELETE FROM uploaded_resources/i);
});
