import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root=new URL("../",import.meta.url).pathname; const read=(path)=>readFileSync(join(root,path),"utf8");

test("Today Plan recommendations store explanations and show human-readable reason labels",()=>{const service=read("lib/smart-planner/service.ts");const ui=read("components/planner/today-plan-client.tsx");assert.match(service,/reasonCode:/);assert.match(service,/reasonText:/);assert.match(ui,/reasonLabel\(item\.reasonCode\)/);assert.match(ui,/phase9-reason-chip/);});
test("manual changes override generated suggestions and survive recomputation",()=>{const service=read("lib/smart-planner/service.ts");assert.match(service,/manual_override \|\| item\.status !== "planned"/);assert.match(service,/blockedKeys = new Set\(preserved\.map/);assert.match(service,/manual_override: true/);assert.match(service,/event_type: "manual_plan_change"/);});
test("legacy smart-planner keeps its internal attempt-month estimate while Product Phase 9 withholds public forecast without verified dates",()=>{const service=read("lib/smart-planner/service.ts");const forecast=read("app/(student)/analytics/forecast/page.tsx");assert.match(service,/attemptMonthAnchor/);assert.match(service,/"attempt_month"/);assert.match(forecast,/selected attempt month alone is not enough/i);assert.match(forecast,/Only a verified attempt date can anchor the baseline forecast/i);assert.doesNotMatch(forecast,/getForecastPageModel/);});
test("meaningful events trigger recomputation instead of constant full recalculation",()=>{const service=read("lib/smart-planner/service.ts");assert.match(service,/MEANINGFUL_EVENTS/);assert.match(service,/meaningfulEvent && plan\.generated_at < meaningfulEvent\.created_at/);assert.match(service,/if \(stale\)/);});
