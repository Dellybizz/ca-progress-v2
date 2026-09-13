import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const d1 = readFileSync(join(root, "d1/migrations/0001_phase2_platform.sql"), "utf8");
const types = readFileSync(join(root, "lib/data/database.types.ts"), "utf8");

test("current D1 profiles schema carries onboarding fields", () => {
  for (const field of ["ca_level", "group_choice", "attempt_key", "daily_target_minutes", "onboarding_step", "onboarding_completed_at"]) assert.match(d1, new RegExp(field));
  assert.match(d1, /CREATE TABLE IF NOT EXISTS profiles/);
  assert.match(d1, /CREATE TABLE IF NOT EXISTS user_preferences/);
});

test("current D1 identity model preserves stable application user ids", () => {
  assert.match(d1, /CREATE TABLE IF NOT EXISTS app_users/);
  assert.match(d1, /user_id TEXT PRIMARY KEY/);
  assert.match(d1, /provider_subject TEXT/);
  assert.match(d1, /UNIQUE\(auth_provider, provider_subject\)/);
});

test("retired phone OTP table is absent from provider-neutral application types", () => {
  assert.equal(types.includes("auth_otp_rate_limits"), false);
});
