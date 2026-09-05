import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root=new URL("../",import.meta.url).pathname; const read=(path)=>readFileSync(join(root,path),"utf8");

test("calendar is a timezone-aware composed view over current source tables",()=>{const service=read("lib/planner/calendar.ts");for(const source of ["tasks","goals","user_calendar_events","exam_attempts","exam_events"]) assert.match(service,new RegExp(`from\\(\"${source}\"\\)`));assert.match(service,/localMonthKey/);assert.match(service,/profile\.timezone/);assert.match(service,/verification_status.*verified/);assert.match(service,/readOnly: true/);});
test("calendar UI keeps official exam markers read-only while personal events are editable",()=>{const calendar=read("components/planner/calendar-client.tsx");assert.match(calendar,/Official ICAI/);assert.match(calendar,/item\.readOnly/);assert.match(calendar,/Verified official event — read only/);assert.match(calendar,/action: editingId \? "update" : "create"/);assert.match(calendar,/action: "delete"/);});
test("activity timeline is derived from study sessions and progress events",()=>{const service=read("lib/planner/service.ts");assert.match(service,/getHotActivityRows/);assert.match(service,/getHotActivityRows\(userId, 40\)/);assert.match(service,/sessions: hot\.sessions/);assert.match(service,/progress: hot\.progress/);});
