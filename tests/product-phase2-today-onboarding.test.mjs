import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Product Phase 2 keeps onboarding short and stores preparation state without using it as fake performance", () => {
  const wizard = read("components/auth/onboarding-wizard.tsx");
  const validation = read("lib/profile/validation.ts");
  const route = read("app/api/onboarding/route.ts");
  const migration = read("d1/migrations/0013_product_phase2_onboarding_experience.sql");

  assert.match(wizard, /Choose your CA level/);
  assert.match(wizard, /Choose your group/);
  assert.match(wizard, /Choose your attempt/);
  assert.match(wizard, /Where are you in your preparation/);
  assert.match(wizard, /Starting now/);
  assert.match(wizard, /Studying the syllabus/);
  assert.match(wizard, /Revising completed portions/);
  assert.match(wizard, /Mainly tests and practice/);
  assert.doesNotMatch(wizard, /Daily target \(minutes\)|dailyTargetMinutes/);
  assert.match(validation, /validateOnboardingSelection/);
  assert.match(route, /saveOnboardingPreparationState/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS onboarding_experience/);
});

test("Product Phase 2 new-user and existing-user routing make Today the default without re-onboarding completed users", () => {
  const home = read("app/page.tsx");
  const navigation = read("lib/auth/navigation.ts");
  const login = read("app/(public)/login/page.tsx");
  const onboarding = read("app/(public)/onboarding/page.tsx");

  assert.match(home, /redirect\("\/planner\/today"\)/);
  assert.match(navigation, /fallback = "\/planner\/today"/);
  assert.match(login, /"\/planner\/today"/);
  assert.match(onboarding, /"\/planner\/today"/);
  assert.match(onboarding, /if \(profile\.onboarding_completed_at\) redirect\(next\)/);
  assert.match(onboarding, /OnboardingWizard/);
});

test("Product Phase 2 Today remains usable without a Smart Planner entitlement or AI refresh job", () => {
  const page = read("app/(student)/planner/today/page.tsx");
  const route = read("app/api/planner/today/route.ts");

  assert.doesNotMatch(page, /FeatureLock|getEntitlementForUser|planner\.smart/);
  assert.doesNotMatch(route, /getEntitlementForUser|ENTITLEMENT_REQUIRED|ai-plan-generation|enqueueBackgroundJob/);
  assert.match(route, /performTodayPlanInteraction\(body\)/);
  assert.doesNotMatch(page, /mentor|Mentor/);
});

test("Product Phase 2 starter Today suppresses weakness claims until recorded evidence exists", () => {
  const display = read("lib/smart-planner/today-display.ts");
  const firstWeek = read("lib/product/first-week.ts");

  assert.match(display, /hasRecordedEvidence/);
  assert.match(display, /evidenceMode === "starter"/);
  assert.match(display, /weakSubjects: safeWeakSubjects/);
  assert.match(display, /reasonCode: "remaining_syllabus"/);
  assert.match(display, /No performance claim is being made yet/);
  assert.doesNotMatch(display, /preparation_state|preparationState/);
  assert.match(firstWeek, /recorded values, not estimates of ability/);
});

test("Product Phase 2 Today shows attempt countdown, planned/completed duration and the four required actions", () => {
  const page = read("app/(student)/planner/today/page.tsx");
  const client = read("components/planner/today-plan-client.tsx");

  assert.match(page, /Days remaining/);
  assert.match(page, /Planned study/);
  assert.match(page, /Completed today/);
  for (const action of ["Start Study", "Rearrange", "Add Task", "View Full Planner"]) assert.match(page, new RegExp(action));
  assert.match(client, /itemKind/);
  assert.match(client, /revision/);
  assert.match(client, /test/);
  assert.match(client, /today-plan-timeline/);
});

test("Product Phase 2 first-week prompts are evidence-based, day-scoped and non-blocking", () => {
  const experience = read("lib/product/first-week.ts");
  const page = read("app/(student)/planner/today/page.tsx");

  for (const day of [1, 2, 3, 4, 5, 7]) assert.match(experience, new RegExp(`day: ${day}`));
  assert.match(experience, /Day 1 · Build your real starting point/);
  assert.match(experience, /Yesterday’s study/);
  assert.match(experience, /Recorded streak/);
  assert.match(experience, /Study Buddy/);
  assert.match(experience, /first analytics check/);
  assert.match(experience, /Your First CA Progress Week/);
  assert.match(experience, /return null/);
  assert.match(page, /model\.firstWeek \?/);
  assert.doesNotMatch(page, /firstWeek[\s\S]{0,100}redirect\(/);
  assert.doesNotMatch(page, /aria-modal=.*firstWeek|firstWeek.*aria-modal/);
});

test("Product Phase 2 Today completion continues updating source planner, progress and test state without duplicate manual bookkeeping", () => {
  const service = read("lib/smart-planner/service.ts");
  const interactions = read("lib/smart-planner/today-interactions.ts");

  assert.match(service, /progress_set_stage/);
  assert.match(service, /p_stage: "completed"/);
  assert.match(service, /p_stage: item\.test_number === 1 \? "test_1" : "test_2"/);
  assert.match(service, /from\("tasks"\)\.update\(\{ status: "done"/);
  assert.match(service, /from\("daily_plan_items"\)\.update\(\{ status: "completed"/);
  assert.match(interactions, /captureSnapshot/);
  assert.match(interactions, /recordChange/);
  assert.match(interactions, /getTodayPlanPageModel\(\{ force: true \}\)/);
});

test("Product Phase 2 production deployment applies the additive onboarding experience migration", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
  assert.match(workflow, /0013_product_phase2_onboarding_experience\.sql/);
  assert.match(workflow, /onboarding_experience/);
});
