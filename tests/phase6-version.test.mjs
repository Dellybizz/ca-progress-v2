import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");
test("Phase 6 remains implemented after the V2 staging label advances", () => { const migration=read("supabase/migrations/20260830130000_phase6_study_planner_calendar.sql"); const study=read("lib/study/service.ts"); assert.match(migration,/create table public\.study_sessions/); assert.match(migration,/create table public\.study_timer_state/); assert.match(study,/study_sessions/); assert.match(read("wrangler.jsonc"), /NEXT_PUBLIC_APP_VERSION\": \"phase-7\"/); });
