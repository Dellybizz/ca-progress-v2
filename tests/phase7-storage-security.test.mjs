import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 7 files use a private Cloudflare R2 binding behind the Community Next worker", () => {
  const router = read("wrangler.web.jsonc");
  const communityWorker = read("workers/web-community/wrangler.jsonc");
  const r2 = read("lib/resources/r2.ts");
  const access = read("app/api/resources/[id]/access/route.ts");
  const migration = read("supabase/migrations/20260830153000_phase7_cloudflare_r2_resource_storage.sql");
  assert.match(router, /"binding": "COMMUNITY_WEB_SERVICE"/);
  assert.match(router, /"service": "ca-progress-v2-web-community"/);
  assert.doesNotMatch(router, /"binding": "USER_RESOURCES_R2"/);
  assert.match(communityWorker, /"binding": "USER_RESOURCES_R2"/);
  assert.match(communityWorker, /"bucket_name": "ca-progress-v2-staging-user-resources"/);
  assert.match(communityWorker, /"workers_dev"\s*:\s*false/);
  assert.match(router, /"required": \["SUPABASE_SERVICE_ROLE_KEY"\]/);
  assert.match(r2, /getCloudflareContext/);
  assert.match(r2, /RESOURCE_R2_STORAGE_BUCKET/);
  assert.match(access, /row\.owner_user_id === identity\.id \|\| \(row\.visibility === "shared" && row\.moderation_status === "approved"\)/);
  assert.match(access, /bucket\.get\(row\.storage_path\)/);
  assert.match(access, /Content-Disposition/);
  assert.match(access, /private, no-store/);
  assert.match(migration, /"provider":"cloudflare_r2"/);
  assert.match(migration, /"public":false/);
  assert.doesNotMatch(access, /getPublicUrl|createSignedUrl/);
});

test("Phase 7 resource metadata mutations stay server-service-role-only after Phase 11 quota integration", () => {
  const rpcMigration = read("supabase/migrations/20260830153000_phase7_cloudflare_r2_resource_storage.sql");
  const hardening = read("supabase/migrations/20260830154500_phase7_r2_rpc_privilege_hardening.sql");
  const upload = read("app/api/resources/upload/route.ts");
  const billingService = read("lib/billing/service.ts");
  const quotaMigration = read("supabase/migrations/20260830212500_phase11_atomic_resource_quota.sql");
  const resourceRoute = read("app/api/resources/[id]/route.ts");
  assert.match(rpcMigration, /create or replace function public\.phase7_create_uploaded_resource/);
  assert.match(hardening, /revoke execute on function public\.phase7_create_uploaded_resource[\s\S]*from authenticated/);
  assert.match(hardening, /revoke execute on function public\.phase7_update_uploaded_resource[\s\S]*from authenticated/);
  assert.match(hardening, /revoke execute on function public\.phase7_delete_uploaded_resource[\s\S]*from authenticated/);
  assert.match(hardening, /metadata_mutations\":\"server_service_role_only/);
  assert.match(upload, /createResourceMetadataWithinQuota/);
  assert.match(billingService, /import "server-only"/);
  assert.match(billingService, /getSupabaseAdminRuntimeConfig\(\)/);
  assert.match(billingService, /rpc\/phase11_create_uploaded_resource/);
  assert.match(quotaMigration, /revoke all on function public\.phase11_create_uploaded_resource[\s\S]*from public,anon,authenticated/);
  assert.match(quotaMigration, /grant execute on function public\.phase11_create_uploaded_resource[\s\S]*to service_role/);
  assert.match(resourceRoute, /createAdminSupabaseClient\(\)/);
  assert.match(resourceRoute, /admin\.from\("uploaded_resources"\)/);
  assert.doesNotMatch(upload, /admin\.storage|\.storage\.from\(/);
  assert.doesNotMatch(resourceRoute, /admin\.storage|\.storage\.from\(/);
});

test("server-only Supabase credentials resolve from Cloudflare runtime bindings", () => {
  const runtimeEnv = read("lib/cloudflare/runtime-env.ts");
  const splitRuntime = read("workers/next-runtime.ts");
  const admin = read("lib/supabase/admin.ts");
  const upload = read("app/api/resources/upload/route.ts");
  assert.match(runtimeEnv, /getCloudflareContext/);
  assert.match(runtimeEnv, /process\.env\[name\]/);
  assert.match(splitRuntime, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(splitRuntime, /x-ca-progress-service-role/);
  assert.match(admin, /getServerRuntimeValue\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.match(admin, /getSupabaseAdminRuntimeConfig/);
  assert.match(upload, /getSupabaseAdminRuntimeConfig\(\)/);
  assert.doesNotMatch(upload, /getSupabaseAdminConfig/);
});

test("legacy Supabase Storage policies remain non-public during transition", () => {
  const storageHardening = read("supabase/migrations/20260830141500_phase7_storage_write_hardening.sql");
  assert.match(storageHardening, /drop policy if exists "user_resources_select_own"/);
  assert.match(storageHardening, /drop policy if exists "user_resources_insert_own"/);
});
