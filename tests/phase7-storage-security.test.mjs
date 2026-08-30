import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 7 files use a private server-signed Storage path", () => {
  const base = read("supabase/migrations/20260830140100_phase7_notes_resources.sql");
  const hardening = read("supabase/migrations/20260830141500_phase7_storage_write_hardening.sql");
  const service = read("lib/resources/service.ts");
  assert.match(base, /'user-resources',[\s\S]*?false,[\s\S]*?10485760/);
  assert.match(hardening, /drop policy if exists "user_resources_select_own"/);
  assert.match(hardening, /drop policy if exists "user_resources_insert_own"/);
  assert.match(hardening, /storage_access\":\"server_signed_only/);
  assert.match(service, /row\.owner_user_id === identity\.id \|\| \(row\.visibility === "shared" && row\.moderation_status === "approved"\)/);
  assert.match(service, /createAdminSupabaseClient\(\)/);
  assert.match(service, /createSignedUrl\(row\.storage_path, SIGNED_URL_SECONDS/);
  assert.doesNotMatch(service, /getPublicUrl/);
});

test("Phase 7 metadata mutations are limited to intended server or RPC paths", () => {
  const storageHardening = read("supabase/migrations/20260830141500_phase7_storage_write_hardening.sql");
  const privilegeHardening = read("supabase/migrations/20260830142000_phase7_privilege_hardening.sql");
  assert.match(storageHardening, /revoke insert, update, delete on public\.uploaded_resources from authenticated/);
  assert.match(privilegeHardening, /revoke all on public\.uploaded_resources from anon, authenticated/);
  assert.match(privilegeHardening, /revoke all on public\.note_tags from anon, authenticated/);
  assert.match(privilegeHardening, /revoke all on public\.note_tag_map from anon, authenticated/);
  assert.match(privilegeHardening, /grant select on public\.notes, public\.note_tags, public\.note_tag_map, public\.uploaded_resources, public\.resource_moderation, public\.resource_reports to authenticated/);
  assert.match(privilegeHardening, /grant delete on public\.notes to authenticated/);
  assert.match(privilegeHardening, /server_service_role_only/);
  assert.match(privilegeHardening, /authorized_signed_urls_only/);
});
