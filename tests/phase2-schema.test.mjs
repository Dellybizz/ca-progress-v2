import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const sql = readFileSync(join(root, "supabase/migrations/20260830020100_phase2_auth_profiles.sql"), "utf8");
const permissions = readFileSync(join(root, "supabase/migrations/20260830020200_phase2_auth_function_permissions.sql"), "utf8");
test("Phase 2 extends profiles with onboarding fields and checks", () => { for (const field of ["ca_level","group_choice","attempt_key","daily_target_minutes","onboarding_step","onboarding_completed_at"]) assert.match(sql, new RegExp(field)); assert.match(sql, /profiles_daily_target_check/); assert.match(sql, /profiles_onboarding_step_check/); });
test("new auth users bootstrap profile and UI preference rows", () => { assert.match(sql, /handle_new_auth_user/); assert.match(sql, /on_auth_user_created/); assert.match(sql, /insert into public\.profiles/i); assert.match(sql, /insert into public\.user_preferences/i); assert.match(permissions, /revoke execute on function public\.handle_new_auth_user\(\) from public, anon, authenticated/i); });
test("OTP abuse records are server-only RLS data and store hashes", () => { assert.match(sql, /create table public\.auth_otp_rate_limits/i); assert.match(sql, /phone_hash/); assert.match(sql, /ip_hash/); assert.match(sql, /enable row level security/i); assert.match(sql, /revoke all on public\.auth_otp_rate_limits from anon, authenticated/i); });
test("avatar bucket is private with own-folder policies", () => { assert.match(sql, /'avatars'/); assert.match(sql, /2097152/); for (const policy of ["avatars_select_own","avatars_insert_own","avatars_update_own","avatars_delete_own"]) assert.match(sql, new RegExp(policy)); assert.match(sql, /storage\.foldername/); });
test("attempt selector has a database-backed non-academic placeholder until Phase 3", () => { assert.match(sql, /onboarding\.attempt_options/); assert.match(sql, /non_academic_placeholder/); assert.match(sql, /Verified academic attempts replace this placeholder in Phase 3/); });
