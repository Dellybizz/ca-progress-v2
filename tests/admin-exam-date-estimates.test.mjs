import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("provisional exam dates are centrally managed and audited", () => {
  const migration = read("d1/migrations/0042_admin_exam_date_estimates.sql");
  const windowMigration = read("d1/migrations/0043_exam_date_estimate_windows.sql");
  const actions = read("app/(admin)/admin/icai-sync/estimate-actions.ts");
  const admin = read("components/icai/admin-sync-data.tsx");
  assert.match(migration, /admin_exam_date_estimates/);
  assert.doesNotMatch(migration, /user_id|private user/);
  assert.match(windowMigration, /estimated_end_date/);
  assert.match(actions, /requireAdminCapability\("icai\.review"\)/);
  assert.match(actions, /icai\.exam_estimate\.save/);
  assert.match(actions, /recordAdminAuditEvent/);
  assert.match(admin, /Publish provisional exam period/);
  assert.match(admin, /name="estimatedEndDate"/);
});

test("upcoming attempts have temporary fallbacks without inventing a January Final attempt", () => {
  const estimates = read("lib/icai/exam-date-estimates.ts");
  assert.match(estimates, /attemptKey: "2026-11"/);
  assert.match(estimates, /estimatedDate: "2026-11-02"/);
  assert.match(estimates, /estimatedEndDate: "2026-11-13"/);
  assert.match(estimates, /attemptKey: "2027-01"/);
  assert.match(estimates, /estimatedDate: "2027-01-06"/);
  assert.match(estimates, /estimatedDate: "2027-01-18"/);
  assert.match(estimates, /attemptKey: "2027-05"/);
  assert.match(estimates, /estimatedDate: "2027-05-02"/);
  assert.match(estimates, /estimatedDate: "2027-05-03"/);
  assert.match(estimates, /estimatedDate: "2027-05-14"/);
  assert.match(estimates, /provenance: "system_expected"/);
  assert.match(estimates, /provenance: "official_bridge"/);
  assert.match(estimates, /findBuiltInEstimate/);
  assert.match(estimates, /BUILT_IN_EXAM_DATE_ESTIMATES\.map/);
  assert.doesNotMatch(
    estimates,
    /levelCode: "final",\s*attemptKey: "2027-01"/s,
  );
});

test("verified ICAI dates automatically take priority over temporary estimates", () => {
  const service = read("lib/dashboard/service.ts");
  const student = read("components/dashboard/student-dashboard.tsx");
  assert.match(
    service,
    /firstExam\?\.eventDate \?\? live\.attempt\?\.startDate \?\? null/,
  );
  assert.match(
    service,
    /officialStartDate \?\? estimate\?\.estimatedDate \?\? null/,
  );
  assert.match(service, /estimate\?\.provenance === "official_bridge"/);
  assert.match(
    service,
    /usingEstimate && !usingOfficialBridge[\s\S]*?"admin_estimate"[\s\S]*?: "exam_event"/,
  );
  assert.match(student, /Set by CA Progress admin/);
  assert.doesNotMatch(student, /Set by you|user_estimate/);
  assert.match(student, /"Exam period"/);
  assert.match(student, /"Exam completed"/);
});
