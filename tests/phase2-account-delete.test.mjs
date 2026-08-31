import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("account deletion has a dedicated confirmation surface reachable before onboarding completes", () => {
  for (const file of ["app/(student)/account/delete/page.tsx", "components/auth/delete-account-panel.tsx", "app/api/account/route.ts", "lib/auth/account-deletion.ts"]) assert.equal(existsSync(join(root, file)), true, file);
  const topbar = read("components/shell/topbar-controls.tsx");
  const profile = read("components/auth/profile-form.tsx");
  assert.match(topbar, /href="\/account\/delete"/);
  assert.match(profile, /href="\/account\/delete"/);
});

test("destructive account deletion requires explicit same-origin DELETE confirmation", () => {
  const route = read("app/api/account/route.ts");
  assert.match(route, /export async function DELETE/);
  assert.match(route, /body\?\.confirmation !== "DELETE"/);
  assert.match(route, /origin !== request\.nextUrl\.origin/);
  assert.match(route, /optionalUser\(\)/);
});

test("account deletion cleans private file bytes and deletes the Supabase auth user", () => {
  const service = read("lib/auth/account-deletion.ts");
  assert.match(service, /uploaded_resources/);
  assert.match(service, /storage_path/);
  assert.match(service, /storage\.from\("avatars"\)\.remove/);
  assert.match(service, /bucket\.delete/);
  assert.match(service, /auth\.admin\.deleteUser/);
});

test("governance prevents deleting parent owner or the only active owner", () => {
  const service = read("lib/auth/account-deletion.ts");
  assert.match(service, /PARENT_OWNER_DELETE_BLOCKED/);
  assert.match(service, /SOLE_OWNER_DELETE_BLOCKED/);
  assert.match(service, /role=in\.\(owner,parent_owner\)/);
});

test("requested existing V2 auth account is bootstrapped once as an audited active owner", () => {
  const sql = read("supabase/migrations/20260831121000_requested_owner.sql");
  assert.match(sql, /habeebaasif622@gmail\.com/);
  assert.match(sql, /values\(v_user_id, 'owner', true, null\)/);
  assert.match(sql, /admin\.role_changed/);
  assert.match(sql, /requested_owner_bootstrap/);
  assert.match(sql, /does not exist in the V2 auth project yet/);
  assert.doesNotMatch(sql, /create trigger/i);
});
