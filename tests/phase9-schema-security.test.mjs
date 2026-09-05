import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root=new URL("../",import.meta.url).pathname; const read=(path)=>readFileSync(join(root,path),"utf8");

test("smart planner uses server-side D1 clients after request authorization and introduces no AI secret",()=>{const service=read("lib/smart-planner/service.ts");const env=read(".env.example");assert.match(service,/optionalUser\(\)/);assert.match(service,/createD1AdminClient/);assert.match(service,/createD1ServerClient/);assert.doesNotMatch(service,/createAdminSupabaseClient|@\/lib\/supabase\/admin/);assert.doesNotMatch(env,/PHASE9_[A-Z_]+=|OPENAI_API_KEY|ANTHROPIC_API_KEY/);});
