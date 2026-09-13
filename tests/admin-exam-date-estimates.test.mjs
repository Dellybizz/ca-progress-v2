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

test("verified ICAI events automatically take priority over admin estimates", () => {
  const service = read("lib/dashboard/service.ts");
  const student = read("components/dashboard/student-dashboard.tsx");
  assert.match(service, /firstExam\?\.eventDate \?\? estimate\?\.estimatedDate \?\? null/);
  assert.match(service, /lastExam\?\.eventDate \?\? estimate\?\.estimatedEndDate/);
  assert.match(service, /sourceKind: usingEstimate \? "admin_estimate" : "exam_event"/);
  assert.match(student, /Set by CA Progress admin/);
  assert.doesNotMatch(student, /Set by you|user_estimate/);
  assert.match(student, /"Exam period"/);
  assert.match(student, /"Exam completed"/);
});
