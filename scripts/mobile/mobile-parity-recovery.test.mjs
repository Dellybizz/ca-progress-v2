import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const repo=fs.readFileSync("packages/mobile-data/src/repository.ts","utf8");
const main=fs.readFileSync("apps/mobile/src/main.tsx","utf8");
const bootstrap=fs.readFileSync("app/api/v1/sync/bootstrap/route.ts","utf8");
const sync=fs.readFileSync("packages/mobile-data/src/sync.ts","utf8");

test("full synchronized chapter catalog is exposed to the offline workspace",()=>{
  assert.ok(repo.includes("chapters:Array<{id:string;title:string;subjectId:string|null;number:string|null}>"));
  assert.ok(repo.includes("SELECT server_id,title,parent_server_id,payload_json FROM academic_catalog"));
  assert.ok(repo.includes("const fullProgress:LocalProgressItem[]=chapters.map"));
  assert.ok(repo.includes("progress:fullProgress"));
  assert.ok(bootstrap.includes("'academic_chapter' AS entity_type"));
  assert.ok(sync.includes('payload.subjectId??null'));
});

test("an untouched catalog chapter can become local progress without a prior server row",()=>{
  assert.ok(repo.includes('const prefix=account.id+":progress:"'));
  assert.ok(repo.includes("INSERT INTO progress_records(local_id,server_id,server_version,account_id,academic_context_key,local_state"));
  assert.ok(repo.includes("chapterTitle:catalog.title"));
  assert.ok(repo.includes('outboxStatement(account.id,{type:"progress"'));
  assert.ok(main.includes("Every synchronized syllabus chapter is available here"));
  assert.ok(main.includes("workspace.academic.chapters.map"));
});

test("Syllabus drills from subjects into saved chapters",()=>{
  assert.ok(main.includes("const[selectedSubject,setSelectedSubject]"));
  assert.ok(main.includes("All subjects"));
  assert.ok(main.includes("syllabus-chapter-row"));
  assert.ok(main.includes("chapters.length"));
  assert.ok(main.includes("saved offline"));
});

test("Focus restores context and exposes complete timer lifecycle",()=>{
  assert.ok(repo.includes("export type LocalFocusContext"));
  assert.ok(repo.includes("async readFocusContext"));
  assert.ok(repo.includes("async discardTimer"));
  assert.ok(repo.includes("subjectId:context.subjectId,chapterId:context.chapterId"));
  assert.ok(main.includes("Focus length"));
  assert.ok(main.includes("Break"));
  assert.ok(main.includes("Choose subject"));
  assert.ok(main.includes("Choose chapter"));
  for(const label of ["Pause","Resume","Finish session","Discard"]) assert.ok(main.includes(label),label);
  assert.ok(main.includes('timer.mode==="focus"?Math.max(0,context.focusMinutes*60-elapsed):elapsed'));
});

test("Focus receives the same offline academic workspace as Syllabus and Progress",()=>{
  assert.ok(main.includes('<Focus workspace={workspace} repository={repository}/>'));
  assert.ok(main.includes('workspace.academic.chapters.filter(item=>item.subjectId===context.subjectId)'));
});
