import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dateKeyInIst, daysBetweenDateKeys } from "../lib/dashboard/countdown.ts";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("countdown changes date exactly at the IST boundary",()=>{
  assert.equal(dateKeyInIst(new Date("2027-01-16T18:29:59Z")),"2027-01-16");
  assert.equal(dateKeyInIst(new Date("2027-01-16T18:30:00Z")),"2027-01-17");
  assert.equal(daysBetweenDateKeys("2027-01-16","2027-01-17"),1);
  assert.equal(daysBetweenDateKeys("2027-01-17","2027-01-17"),0);
});

test("dashboard accepts only verified attempt-mapped and subject-applicable exam events",()=>{
  const reference=read("lib/dashboard/reference.ts");
  assert.match(reference,/eq\("attempt_id", attempt\.id\)/);
  assert.match(reference,/eq\("verification_status", "verified"\)/);
  assert.match(reference,/event\.subject_id \? selectedSubjectIds\.has\(event\.subject_id\) : event\.event_type === "exam_start"/);
});

test("review decisions and exam-event controls invalidate ICAI and dashboard caches",()=>{
  const actions=read("app/(admin)/admin/icai-sync/actions.ts");
  assert.match(actions,/manageExamEventAction/);
  for(const intent of ["replace","withdraw"]) assert.match(actions,new RegExp(`"${intent}"`));
  assert.ok((actions.match(/updateTag\("dashboard-live"\)/g)??[]).length>=2);
  assert.match(actions,/invalidateSharedPublicCache\(\["icai"\]\)/);
});

test("dashboard provides evidence details, conflict warning and honest missing state",()=>{
  const dashboard=read("components/dashboard/student-dashboard.tsx");
  assert.match(dashboard,/View exam details/);
  assert.match(dashboard,/countdown\.conflictWarning/);
  assert.match(read("app/(student)/dashboard/exam/page.tsx"),/Official exam date is awaiting approval/);
});
