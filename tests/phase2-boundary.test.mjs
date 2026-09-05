import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 2 implementation remains free of Phase 3 academic schema ownership", () => {
  const phase2Source = [
    "supabase/migrations/20260830020100_phase2_auth_profiles.sql",
    "supabase/migrations/20260830020200_phase2_auth_function_permissions.sql",
    "supabase/migrations/20260830020300_phase2_social_login_only.sql",
    "app/auth/google/route.ts",
    "app/auth/linkedin/route.ts",
    "app/auth/callback/route.ts",
    "app/auth/signout/route.ts",
  ].map(read).join("\n");
  for (const name of ["create table public.course_levels", "create table public.syllabus_versions", "chapter_dependencies", "chapter_progress"]) assert.equal(phase2Source.includes(name), false, name);
});

test("Phase 2 keeps auth request-scoped instead of adding a giant AuthContext", () => {
  const authSource = [
    "lib/auth/server.ts",
    "lib/auth/provider.ts",
    "lib/auth/proxy.ts",
  ].map(read).join("\n");
  assert.equal(/createContext\([^)]*auth/i.test(authSource), false);
  assert.match(read("lib/auth/server.ts"), /optionalUser/);
  assert.match(read("lib/auth/server.ts"), /requireUser/);
});
