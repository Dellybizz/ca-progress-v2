import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root=new URL("../",import.meta.url).pathname; const read=(path)=>readFileSync(join(root,path),"utf8");

test("private resource files use a Cloudflare R2 Worker binding",()=>{const wrangler=read("wrangler.web.jsonc");const r2=read("lib/resources/r2.ts");const access=read("app/api/resources/[id]/access/route.ts");assert.match(wrangler,/"binding": "USER_RESOURCES_R2"/);assert.match(wrangler,/"bucket_name": "ca-progress-v2-staging-user-resources"/);assert.match(r2,/getCloudflareContext/);assert.match(access,/createR2PresignedUrl/);assert.match(access,/private, no-store/);assert.doesNotMatch(access,/getPublicUrl|createSignedUrl/);});
test("resource metadata stays server-only with D1 quota enforcement",()=>{const upload=read("app/api/resources/upload-complete/route.ts");const billing=read("lib/billing/service.ts");assert.match(upload,/createResourceMetadataWithinQuota/);assert.match(billing,/import "server-only"/);assert.match(billing,/createD1AdminClient/);assert.match(upload,/getHotD1Database/);assert.match(upload,/getResourceR2Bucket/);assert.doesNotMatch(upload,/SUPABASE_SERVICE_ROLE_KEY|@\/lib\/supabase\/admin|\.storage\.from\(/);});
test("active R2 upload no longer depends on Supabase server credentials",()=>{const runtime=read("lib/cloudflare/runtime-env.ts");const upload=read("app/api/resources/upload-complete/route.ts");assert.match(runtime,/getCloudflareContext/);assert.match(upload,/getHotD1Database/);assert.match(upload,/getResourceR2Bucket/);assert.doesNotMatch(upload,/SUPABASE_SERVICE_ROLE_KEY|getSupabaseAdminRuntimeConfig|@\/lib\/supabase\/admin/);});
