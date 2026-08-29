import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname; const read = (p) => readFileSync(join(root, p), "utf8"); const migration = read("supabase/migrations/20260830010100_phase1_user_preferences.sql");
test("user_preferences is migration-backed and RLS protected", () => { assert.match(migration, /create table public\.user_preferences/i); assert.match(migration, /enable row level security/i); for (const policy of ["select_own", "insert_own", "update_own", "delete_own"]) assert.match(migration, new RegExp(`user_preferences_${policy}`)); assert.match(migration, /auth\.uid\(\)/); });
test("UI preference contract aligns with the database schema", () => { const contract = read("lib/preferences/contract.ts"); for (const value of ["system", "light", "dark", "indigo", "violet", "emerald", "rose", "comfortable", "compact"]) { assert.match(contract, new RegExp(`"${value}"`)); assert.match(migration, new RegExp(`'${value}'`)); } assert.match(read("lib/supabase/database.types.ts"), /user_preferences/); });
