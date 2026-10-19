import { readFileSync } from "node:fs";

function query(path) {
  const output = readFileSync(path, "utf8");
  const start = output.indexOf("[");
  if (start < 0) throw new Error(`Missing D1 JSON in ${path}`);
  const response = JSON.parse(output.slice(start));
  if (!Array.isArray(response) || response.length !== 1 || response[0].success !== true || !Array.isArray(response[0].results)) throw new Error(`D1 query failed: ${path}`);
  return response[0].results;
}

const bookmark = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (!bookmark.bookmark) throw new Error("Recovery bookmark missing");
const before = query(process.argv[3])[0];
const after = query(process.argv[4])[0];
const violations = query(process.argv[5]);
if (!before || !after || violations.length) throw new Error("Account baseline or foreign-key check failed");
for (const field of ["app_users", "profiles", "chapter_progress", "progress_events", "daily_plans", "study_sessions", "notes", "uploaded_resources"]) {
  if (Number(after[field]) < Number(before[field])) throw new Error(`Owned-record count decreased: ${field}`);
}
if (Number(after.account_usernames) !== Number(after.app_users) || Number(after.missing_usernames) !== 0 || Number(after.password_mismatches) !== 0 || Number(after.migration_applied) !== 1) {
  throw new Error(`Username migration is incomplete: ${JSON.stringify(after)}`);
}
console.log(`Phase 1 passed: ${after.account_usernames} unique aliases for ${after.app_users} existing/current accounts; ownership records preserved; foreign keys clean.`);
