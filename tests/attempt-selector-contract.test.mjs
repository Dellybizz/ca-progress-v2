import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { visibleAttemptKeys } from "../lib/profile/validation.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("attempt window keeps one previous, current and every available future attempt", () => {
  const attempts = ["2025-09", "2026-01", "2026-05", "2026-09", "2027-01", "2027-05"].map((key) => ({ key }));
  assert.deepEqual(visibleAttemptKeys(attempts, new Date("2026-09-11T12:00:00Z")).map((item) => item.key), ["2026-05", "2026-09", "2027-01", "2027-05"]);
});

test("website attempt selectors wait for their upstream academic selection", () => {
  const profile = read("components/auth/profile-form.tsx");
  const admin = read("components/icai/admin-sync-data.tsx");
  const resources = read("components/icai/resource-browser.tsx");
  const updates = read("components/icai/updates-feed.tsx");
  assert.match(profile, /Select level and group first/);
  assert.match(admin, /Select level and group first/);
  assert.match(admin, /selectedEstimate\?\.estimatedDate/);
  assert.match(resources, /Select level first/);
  assert.match(updates, /Select level first/);
});

test("admin-entered date attempts are merged into the admin selector", () => {
  assert.match(read("components/icai/admin-sync-data.tsx"), /\.\.\.estimates\.map/);
});
