import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("Phase 3 adds policy-level Razorpay Subscription Offer binding",()=>{
  const sql=read("d1/migrations/0055_billing_subscription_offer_normalization.sql");
  assert.match(sql,/ALTER TABLE plan_policy_offer_terms ADD COLUMN provider_offer_id/);
  assert.match(sql,/provider_offer_verified_at/);
  assert.match(sql,/provider_offer_snapshot_json/);
  assert.match(sql,/Introductory subscription pricing requires a Razorpay Subscription Offer/);
  assert.match(sql,/VALUES \('0055'/);
  const retained=read("scripts/apply-retained-d1-migrations.mjs");
  assert.match(retained,/0055_billing_subscription_offer_normalization\.sql/);
  assert.match(retained,/BETWEEN '0012' AND '0055'/);
});

test("Phase 3 creates intro subscriptions on the stable recurring plan with an Offer",()=>{
  const worker=read("workers/billing/p3.ts");
  const start=worker.indexOf("async function createSubscription");
  const end=worker.indexOf("async function verifySubscription",start);
  const create=worker.slice(start,end);
  assert.match(create,/ensurePlan\(env,terms,"recurring",terms\.recurringPrice\)/);
  assert.doesNotMatch(create,/ensurePlan\(env,terms,"intro"/);
  assert.match(create,/requireIntroOffer\(terms\)/);
  assert.match(create,/plan_id:recurring\.providerPlanId/);
  assert.match(create,/payload\.offer_id=introOfferId/);
  assert.match(create,/provider_plan_id,recurring_provider_plan_id/);
  assert.match(create,/\?7,\?7/);
});

test("Phase 3 reconciles the discounted first cycle without treating it as a plan mismatch",()=>{
  const worker=read("workers/billing/p3.ts");
  assert.match(worker,/offerBound&&previousPaid<introCycles\?Number\(local\.initial_price_subunits/);
  assert.match(worker,/provider_offer_mismatch/);
  assert.match(worker,/offer_id:value\.offer_id/);
});

test("Phase 3 removes automatic intro plan PATCH and quarantines legacy split-plan checkout",()=>{
  const p3=read("workers/billing/p3.ts"),p4=read("workers/billing/p4-final.ts"),closure=read("workers/billing/p4-closure.ts");
  const p3Intro=p3.slice(p3.indexOf("async function maybeScheduleIntro"),p3.indexOf("async function reconcile"));
  const p4Intro=p4.slice(p4.indexOf("async function maybeScheduleIntro"),p4.indexOf("async function campaignReconcile"));
  assert.doesNotMatch(p3Intro,/method:"PATCH"/);
  assert.doesNotMatch(p4Intro,/method:"PATCH"/);
  assert.match(closure,/legacy_intro_plan_requires_repair/);
  assert.match(closure,/provider_plan_id,recurring_provider_plan_id/);
});

test("Phase 3 keeps generic campaigns on the recurring plan and does not stack them with intro pricing",()=>{
  const worker=read("workers/billing/p4-final.ts");
  const start=worker.indexOf("async function createCampaignSubscription");
  const end=worker.indexOf("async function maybeScheduleIntro",start);
  const create=worker.slice(start,end);
  assert.match(create,/if\(terms\.introPrice!==null\)/);
  assert.match(create,/Promo codes cannot be combined with introductory subscription pricing/);
  assert.match(create,/plan_id:recurring\.providerPlanId/);
  assert.doesNotMatch(create,/ensurePlan\(env,terms,"intro"/);
});
