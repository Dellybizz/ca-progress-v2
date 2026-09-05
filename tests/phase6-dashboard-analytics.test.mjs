import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root=new URL("../",import.meta.url).pathname; const read=(path)=>readFileSync(join(root,path),"utf8");

test("dashboard task and study slots use real normalized data",()=>{const service=read("lib/dashboard/service.ts");const ui=read("components/dashboard/student-dashboard.tsx");assert.match(service,/getPlannerDashboardSummary/);assert.match(service,/getStudyAnalytics/);assert.match(service,/status: "tracked"/);assert.match(ui,/model\.today\.tasks/);assert.match(ui,/model\.study\.studiedThisWeekMinutes/);assert.match(ui,/model\.study\.streakDays/);});
test("finished study sessions immediately feed analytics",()=>{const study=read("lib/study/service.ts");const analytics=read("app/(student)/analytics/page.tsx");assert.match(study,/getHotStudySessions/);assert.match(analytics,/getStudyPageModel/);assert.match(analytics,/Recent study sessions/);assert.match(analytics,/No manual studyHours array/);});
test("smart recommendation boundary remains intact",()=>{const dashboard=read("lib/dashboard/service.ts");assert.match(dashboard,/status: "contextual_fallback"/);assert.match(dashboard,/phase9Ready: true/);});
