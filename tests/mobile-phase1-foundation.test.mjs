import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile Phase 1 is pinned to the certified production baseline", () => {
  const release = read("config/app-release.ts");
  assert.match(release, /471ade75da025df51fcf98ba6740f400e10b9cae/);
  assert.match(release, /api: Object\.freeze\(\{ current: 1, minimumSupported: 1 \}\)/);
  assert.match(release, /academicContext: Object\.freeze\(\{ current: 1, minimumSupported: 1 \}\)/);
  assert.match(release, /offline: Object\.freeze\(\{ current: [2-9][0-9]*, minimumSupported: 2 \}\)/);
});

test("mobile and website share one versioned academic context", () => {
  const context = read("lib/academic/student-context.ts");
  const mobile = read("lib/mobile/contract.ts");
  assert.match(context, /ACADEMIC_CONTEXT_CONTRACT_VERSION = 1/);
  assert.match(context, /export const getStudentContext = cache/);
  assert.match(mobile, /publicStudentContext\(context: StudentContextContract\)/);
  assert.doesNotMatch(mobile, /getD1RuntimeDatabase|\.prepare\(/);
});

test("bootstrap, Today, progress and offline paths expose compatible contracts", () => {
  const bootstrap = read("app/api/v1/bootstrap/route.ts");
  const today = read("app/api/planner/today/route.ts");
  const progress = read("app/api/progress/route.ts");
  const offline = read("app/api/offline/context/route.ts");
  assert.match(bootstrap, /getStudentContext/);
  assert.match(bootstrap, /APP_RELEASE_CONTRACT/);
  assert.match(bootstrap, /publicStudentContext/);
  assert.match(today, /export async function GET/);
  assert.match(today, /getTodayPlanPageModel/);
  assert.match(today, /MOBILE_API_HEADERS/);
  assert.match(progress, /X-CA-API-Version/);
  assert.match(progress, /X-CA-Context-Version/);
  assert.match(offline, /publicStudentContext/);
});

test("the release endpoint is public configuration without secrets", () => {
  const route = read("app/api/app-config/route.ts");
  const release = read("config/app-release.ts");
  assert.match(route, /public, max-age=60, stale-while-revalidate=300/);
  assert.doesNotMatch(`${route}\n${release}`, /SECRET|TOKEN|PASSWORD|RAZORPAY_KEY/);
});

test("dependency installation is locked across active workflows", () => {
  assert.equal(existsSync(new URL("../package-lock.json", import.meta.url)), true);
  for (const workflow of [
    ".github/workflows/ci.yml",
    ".github/workflows/deploy-staging.yml",
    ".github/workflows/p0-live-state-lock.yml",
    ".github/workflows/product-consistency-phase0-backup.yml",
    ".github/workflows/product-consistency-phase12-certification.yml",
    ".github/workflows/supabase-retirement-closure.yml",
    ".github/workflows/phase1-admin-live-verification.yml",
    ".github/workflows/icai-live-verification.yml",
  ]) {
    const source = read(workflow);
    assert.match(source, /npm ci --no-audit --no-fund/);
    assert.doesNotMatch(source, /npm install --no-audit --no-fund/);
  }
});
