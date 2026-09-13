import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root=new URL("../",import.meta.url).pathname; const read=(path)=>readFileSync(join(root,path),"utf8");

test("study UI exposes subject chapter selection and Pomodoro presets without a manual hours array",()=>{const client=read("components/study/study-timer.tsx");const service=read("lib/study/service.ts");assert.match(client,/25 \/ 5/);assert.match(client,/50 \/ 10/);assert.match(client,/focusMinutes/);assert.match(client,/subjectId/);assert.match(client,/chapterId/);assert.match(client,/action: "pause"/);assert.match(client,/action: "resume"/);assert.match(client,/action: "finish"/);assert.match(service,/getHotStudySessions/);assert.match(service,/getHotStudyTimer/);assert.doesNotMatch(`${client}\n${service}`,/studyHours\s*[:=]/);});
