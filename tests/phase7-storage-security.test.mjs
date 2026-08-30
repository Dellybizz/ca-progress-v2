import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 7 files use a private Cloudflare R2 Worker binding", () => {
  const wrangler = read("wrangler.jsonc");
  const r2 = read("lib/resources/r2.ts");
  const access = read("app/api/resources/[id]/access/route.ts");
  const migration = read("supabase/migrations/20260830153000_phase7_cloudflare_r2_resource_storage.sql");
  assert.match(wrangler, /"binding": "USER_RESOURCES_R2"/);
  assert.match(wrangler, /"bucket_name": "ca-progress-v2-staging-user-resources"/);
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

test("Phase 7 resource metadata mutations use authenticated security-definer RPCs", () => {
  const migration = read("supabase/migrations/20260830153000_phase7_cloudflare_r2_resource_storage.sql");
  const upload = read("app/api/resources/upload/route.ts");
  const resourceRoute = read("app/api/resources/[id]/route.ts");
  assert.match(migration, /create or replace function public\.phase7_create_uploaded_resource/);
  assert.match(migration, /create or replace function public\.phase7_update_uploaded_resource/);
  assert.match(migration, /create or replace function public\.phase7_delete_uploaded_resource/);
  assert.match(migration, /position\(v_user_id::text \|\| '\/' in p_storage_path\) <> 1/);
  assert.match(migration, /grant execute on function public\.phase7_create_uploaded_resource/);
  assert.match(upload, /phase7_create_uploaded_resource/);
  assert.match(resourceRoute, /phase7_update_uploaded_resource/);
  assert.match(resourceRoute, /phase7_delete_uploaded_resource/);
  assert.doesNotMatch(upload, /createAdminSupabaseClient/);
  assert.doesNotMatch(resourceRoute, /admin\.storage|createAdminSupabaseClient/);
});

test("legacy Supabase Storage policies remain non-public during transition", () => {
  const storageHardening = read("supabase/migrations/20260830141500_phase7_storage_write_hardening.sql");
  assert.match(storageHardening, /drop policy if exists "user_resources_select_own"/);
  assert.match(storageHardening, /drop policy if exists "user_resources_insert_own"/);
});
