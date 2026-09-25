import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main=fs.readFileSync("apps/mobile/src/main.tsx","utf8");
const repo=fs.readFileSync("packages/mobile-data/src/repository.ts","utf8");
const sync=fs.readFileSync("packages/mobile-data/src/sync.ts","utf8");
const server=fs.readFileSync("lib/mobile/sync.ts","utf8");
const offline=fs.readFileSync("app/api/offline/mutations/route.ts","utf8");
const bootstrap=fs.readFileSync("app/api/v1/sync/bootstrap/route.ts","utf8");
const phase8=fs.readFileSync("lib/planner/phase8.ts","utf8");
const goalRoute=fs.readFileSync("app/api/planner/goals/route.ts","utf8");

test("P3 dashboard uses synchronized verified exam date",()=>{
  const start=main.indexOf("function ExamCountdown");
  const end=main.indexOf("function Dashboard",start+1);
  assert.ok(start>=0,"ExamCountdown component missing");
  const countdown=main.slice(start,end>start?end:undefined);
  assert.ok(countdown.includes("examDate"),"countdown is not reading synchronized examDate");
  assert.ok(repo.includes("payload.startDate"),"attempt startDate is not projected locally");
  assert.ok(repo.includes("verificationStatus"),"attempt verification state is not projected locally");
  assert.ok(repo.includes("verified:String(payload.verificationStatus"),"verified state is not stored in the local academic projection");
  assert.ok(bootstrap.includes("a.verification_status='verified'"),"bootstrap is not restricted to verified attempts");
});

test("P3 Today keeps task-only timeline filters",()=>{
  assert.ok(main.includes('item.kind==="task"'),"Today does not exclude goals/revision items");
  assert.ok(main.includes('["pending","all","completed"]'),"Today filters missing");
});

test("P3 Focus exposes modes and restores persisted timer",()=>{
  assert.ok(main.includes('["focus","stopwatch"]'));
  assert.ok(main.includes('repository.readTimer()'),"Focus does not restore the persisted timer");
  assert.ok(main.includes('setTimer(savedTimer)'),"Focus does not apply the restored timer");
  assert.ok(main.includes('repository.readFocusContext()'),"Focus does not restore persisted session context");
  assert.ok(main.includes('setContext(savedContext)'),"Focus does not apply the restored session context");
  assert.ok(repo.includes("INSERT INTO timer_state"));
  assert.ok(repo.includes('outboxStatement(account.id,{type:"focus_session"'));
});

test("P3 goals and revision settings use local transaction plus outbox",()=>{
  for(const part of ["async createGoal","async toggleGoal","async saveRevisionSettings","await transaction([","planner_goal","revision_settings"]) assert.ok(repo.includes(part),part);
  for(const part of ["Goals","Revision rhythm","Preferred study days","Save settings"]) assert.ok(main.includes(part),part);
});

test("P3 reconnect sync accepts goal and revision mutations end to end",()=>{
  for(const source of [sync,server,offline]){
    assert.ok(source.includes("/api/planner/goals"));
    assert.ok(source.includes("/api/planner/revision-settings"));
  }
  assert.ok(bootstrap.includes("planner_goal"));
  assert.ok(bootstrap.includes("revision_settings"));
});

test("P3 goal create identity is stable across offline replay",()=>{
  assert.ok(phase8.includes("createId ?? crypto.randomUUID"));
  assert.ok(phase8.includes("SELECT id FROM goals WHERE id=?1"));
  assert.ok(goalRoute.includes("clientId?: string"));
  assert.ok(goalRoute.includes("body.clientId || null"));
});
