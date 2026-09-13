import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read=(path)=>readFileSync(join(root,path),"utf8");

test("progress surfaces are real routes with optimistic autosave and normalized analytics", () => { const page=read("app/(student)/progress/page.tsx"); const client=read("components/progress/progress-tracker.tsx"); const service=read("lib/progress/service.ts"); const analytics=read("app/(student)/analytics/page.tsx"); const subject=read("app/(student)/subjects/[subjectSlug]/progress/page.tsx"); assert.doesNotMatch(page,/ProductPreviewPage/); assert.match(client,/Saving automatically/); assert.match(client,/action: "set_stage"/); assert.match(client,/Undo last change/); assert.match(service,/getHotProgressRows/); assert.match(service,/getHotDashboardProgress/); assert.match(service,/hot\.weeklyEvents/); assert.match(service,/hot\.events/); assert.match(analytics,/No manually maintained totals are used/); assert.match(subject,/getProgressPageModel\(subjectSlug\)/); assert.match(subject,/notFound\(\)/); });
test("responsive progress styles include independent mobile treatment", () => { const css=read("app/styles/progress.css"); assert.match(css,/@media\(max-width:640px\)/); assert.match(css,/progress-stage-controls/); assert.match(css,/overflow-x:auto/); assert.match(css,/progress-save-state\{position:sticky/); });
