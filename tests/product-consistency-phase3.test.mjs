import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("shared student services consume the canonical request context",()=>{
  for(const path of ["lib/dashboard/service.ts","lib/study/service.ts","lib/progress/service.ts","lib/planner/service.ts","lib/planner/calendar.ts","lib/analytics/phase9.ts","lib/notes/phase6.ts","lib/resources/service.ts","lib/community/service.ts"])
    assert.match(read(path),/getStudentContext/,`${path} must consume canonical context`);
});

test("signed-in academic search ignores browser-supplied academic authority",()=>{
  const route=read("app/api/academic/search/route.ts");
  assert.match(route,/context\.mode === "ready" \? selectionForAcademicQuery\(context\)/);
  assert.match(route,/Cache-Control": "private, no-store"/);
});

test("subject deep links fail closed outside the current subject set",()=>{
  const query=read("lib/academic/query.ts");
  const page=read("app/(student)/subjects/[subjectSlug]/page.tsx");
  assert.match(query,/getSubjectBySlugForContext/);
  assert.match(query,/contextAllowsSubject\(context, subject\.id\)/);
  assert.match(page,/getSubjectBySlugForContext\(subjectSlug, context\)/);
});

test("ICAI resource filters cannot broaden a signed-in student's scope",()=>{
  const page=read("app/(student)/resources/icai/page.tsx");
  assert.match(page,/selection\?\.level/);
  assert.match(page,/selection\?\.attemptKey/);
  assert.match(page,/!context\.subjectIds\.includes\(requestedSubject\)/);
});

test("activity and resource aggregation remove cross-context rows server-side",()=>{
  assert.match(read("lib/planner/service.ts"),/allowedSubjects\.has\(row\.subject_id\)/);
  assert.match(read("lib/planner/service.ts"),/allowedChapters\.has\(row\.chapter_id\)/);
  const resources=read("lib/resources/service.ts");
  assert.match(resources,/subjectIds\.has\(row\.subject_id\)/);
  assert.match(resources,/mode: "setup".*officialResources: \[\]/);
});

test("calendar uses canonical attempt identity and bounded explicit reads",()=>{
  const calendar=read("lib/planner/calendar.ts");
  assert.match(calendar,/context\.levelId/);
  assert.match(calendar,/context\.selection\.attemptKey/);
  assert.doesNotMatch(calendar,/\.select\("\*"\)/);
  for(const limit of ["limit(500)","limit(250)","limit(100)"]) assert.ok(calendar.includes(limit));
});

test("scoped data has one shared loading empty error and stale contract",()=>{
  const state=read("lib/academic/scoped-data-state.ts");
  for(const status of ["loading","ready","empty","stale","error"]) assert.match(state,new RegExp(`"${status}"`));
  assert.match(state,/contextKey/);
});
