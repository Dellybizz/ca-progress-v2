import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("Phase 4 Part 1 provides reusable academic hierarchy primitives",()=>{
  const navigation=read("components/academic/academic-navigation.tsx");
  for(const component of ["AcademicBreadcrumbs","AcademicContextBar","AcademicEntityMark"]) assert.match(navigation,new RegExp(`export function ${component}`));
  assert.match(navigation,/aria-label="Breadcrumb"/);
  assert.match(navigation,/aria-label="Current academic context"/);
});

test("syllabus and subject views expose consistent navigation and context",()=>{
  const syllabus=read("components/academic/syllabus-explorer.tsx");
  const subject=read("components/academic/subject-detail.tsx");
  for(const source of [syllabus,subject]) {
    assert.match(source,/AcademicBreadcrumbs/);
    assert.match(source,/AcademicContextBar/);
  }
  assert.match(subject,/AcademicEntityMark/);
});

test("Phase 4 browsing states and responsive rollout are implemented",()=>{
  const plan=read("docs/product-consistency/PHASE_4_PLAN.md");
  assert.match(plan,/Part 1[\s\S]*Status: implemented/);
  assert.equal((plan.match(/Status: implemented\./g)??[]).length,3);
  const browser=read("components/icai/resource-browser.tsx");
  for(const state of ["Current","Historical","New","Changed","Unavailable"]) assert.match(browser,new RegExp(`"${state}"`));
  assert.match(browser,/view === "folders"/);
  assert.match(browser,/view === "list"/);
  assert.match(read("components/chapter-hub/chapter-hub.tsx"),/AcademicBreadcrumbs/);
  assert.match(read("app\/styles\/academic.css"),/@media \(max-width: 620px\)/);
});
