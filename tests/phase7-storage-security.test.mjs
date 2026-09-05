import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 7 files use a private Cloudflare R2 Worker binding", () => {
  const wrangler = read("wrangler.web.jsonc");
  const r2 = read("lib/resources/r2.ts");
  const access = read("app/api/resources/[id]/access/route.ts");
  const migration = read("supabase/migrations/20260830153000_phase7_cloudflare_r2_resource_storage.sql");
  assert.match(wrangler, /"binding": "USER_RESOURCES_R2"/);
  assert.match(wrangler, /"bucket_name": "ca-progress-v2-staging-user-resources"/);
  assert.match(wrangler, /"keep_vars": true/);
  assert.match(r2, /getCloudflareContext/);
  assert.match(r2, /RESOURCE_R2_STORAGE_BUCKET/);
  assert.match(access, /row\.owner_user_id === identity\.id \|\| \(row\.visibility === "shared" && row\.moderation_status === "approved"\)/);
  assert.match(access, /createR2PresignedUrl/);
  assert.match(access, /private, no-store/);
  assert.match(migration, /"provider":"cloudflare_r2"/);
  assert.match(migration, /"public":false/);
  assert.doesNotMatch(access, /getPublicUrl|createSignedUrl/);
});

test("Phase 7 resource metadata stays server-only with D1 quota enforcement", () => {
  const rpcMigration = read("supabase/migrations/20260830153000_phase7_cloudflare_r2_resource_storage.sql");
  const hardening = read("supabase/migrations/20260830154500_phase7_r2_rpc_privilege_hardening.sql");
  const upload = read("app/api/resources/upload-complete/route.ts");
  const billingService = read("lib/billing/service.ts");
  assert.match(rpcMigration, /create or replace function public\.phase7_create_uploaded_resource/);
  assert.match(hardening, /metadata_mutations":"server_service_role_only/);
  assert.match(upload, /createResourceMetadataWithinQuota/);
  assert.match(billingService, /import "server-only"/);
  assert.match(billingService, /createD1AdminCompatClient/);
  assert.match(upload, /getHotD1Database/);
  assert.match(upload, /getResourceR2Bucket/);
  assert.doesNotMatch(upload, /getSupabaseAdminRuntimeConfig|getSupabaseAdminConfig|@\/lib\/supabase\/admin|admin\.storage|\.storage\.from\(/);
});

test("active R2 upload no longer depends on Supabase server credentials", () => {
  const runtimeEnv = read("lib/cloudflare/runtime-env.ts");
  const upload = read("app/api/resources/upload-complete/route.ts");
  assert.match(runtimeEnv, /getCloudflareContext/);
  assert.match(runtimeEnv, /process\.env\[name\]/);
  assert.match(upload, /getHotD1Database/);
  assert.match(upload, /getResourceR2Bucket/);
  assert.doesNotMatch(upload, /SUPABASE_SERVICE_ROLE_KEY|getSupabaseAdminRuntimeConfig|getSupabaseAdminConfig|@\/lib\/supabase\/admin/);
});

test("legacy Supabase Storage policies remain non-public during transition", () => {
  const storageHardening = read("supabase/migrations/20260830141500_phase7_storage_write_hardening.sql");
  assert.match(storageHardening, /drop policy if exists "user_resources_select_own"/);
  assert.match(storageHardening, /drop policy if exists "user_resources_insert_own"/);
});
