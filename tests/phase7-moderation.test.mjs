import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");

test("shared notes and uploads require moderation before Community visibility", () => {
  const sql = read("supabase/migrations/20260830140100_phase7_notes_resources.sql");
  assert.match(sql, /visibility text not null default 'private'/);
  assert.match(sql, /new\.moderation_status := 'pending'/);
  assert.match(sql, /notes_read_own_or_approved_shared/);
  assert.match(sql, /visibility = 'shared' and moderation_status = 'approved'/);
  assert.match(sql, /uploaded_resources_read_own_or_approved_shared/);
  assert.match(sql, /create or replace function public\.phase7_moderate_resource/);
  assert.match(sql, /'moderator', 'admin', 'owner', 'parent_owner'/);
});

test("reported Community resources are hidden and return to moderator review", () => {
  const sql = read("supabase/migrations/20260830140100_phase7_notes_resources.sql");
  const report = read("app/api/resources/report/route.ts");
  const admin = read("app/(admin)/admin/resources/moderation/page.tsx");
  assert.match(sql, /Only approved shared notes can be reported/);
  assert.match(sql, /set moderation_status = 'reported'/);
  assert.match(sql, /set moderation_status = 'reported'/);
  assert.match(report, /phase7_report_resource/);
  assert.match(admin, /Resource moderation/);
});
