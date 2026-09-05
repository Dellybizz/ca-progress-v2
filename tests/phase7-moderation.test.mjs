import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root=new URL("../",import.meta.url).pathname; const read=(path)=>readFileSync(join(root,path),"utf8");

test("reported Community resources use current D1 moderation paths",()=>{const report=read("app/api/resources/report/route.ts");const admin=read("app/(admin)/admin/resources/moderation/page.tsx");const service=read("lib/resources/service.ts");assert.match(report,/reportHotResource/);assert.doesNotMatch(report,/\.rpc\(/);assert.match(admin,/Resource moderation/);assert.match(service,/moderation_status/);assert.doesNotMatch(`${report}\n${service}`,/@supabase\/|lib\/supabase/);});
