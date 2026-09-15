import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 7 migration ledger is additive, resumable and append-only", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON; CREATE TABLE app_users(user_id TEXT PRIMARY KEY); CREATE TABLE _ca_schema_migrations(version TEXT PRIMARY KEY,description TEXT,source_freeze_commit TEXT); INSERT INTO app_users VALUES('account-1')");
  const migration = read("d1/migrations/0044_product_consistency_phase7_guest_migration.sql");
  sqlite.exec(migration);
  sqlite.exec(migration);
  sqlite.prepare("INSERT INTO guest_account_migrations(id,guest_id,account_user_id,summary_json) VALUES(?,?,?,?)").run("migration-1", "guest:one", "account-1", "{}");
  sqlite.prepare("INSERT INTO guest_account_migration_audit(id,migration_id,event_type,detail_json) VALUES(?,?,?,?)").run("audit-1", "migration-1", "started", "{}");
  assert.throws(() => sqlite.prepare("DELETE FROM guest_account_migration_audit WHERE id=?").run("audit-1"));
  assert.throws(() => sqlite.prepare("UPDATE guest_account_migration_audit SET detail_json='x' WHERE id=?").run("audit-1"));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM _ca_schema_migrations WHERE version='0044'").get().count, 1);
  sqlite.close();
});

test("stable guest identity is server-issued and bound to the browser", () => {
  const proxy = read("lib/auth/proxy.ts");
  const server = read("lib/auth/guest-server.ts");
  const context = read("app/api/offline/context/route.ts");
  assert.match(proxy, /ca_guest_id/);
  assert.match(proxy, /httpOnly: true/);
  assert.match(proxy, /sameSite: "lax"/);
  assert.match(server, /guest:\$\{value\.toLowerCase\(\)\}/);
  assert.match(context, /guestId/);
});

test("browser migration preserves account data and cleans guest rows only after verification", () => {
  const database = read("lib/offline/database.ts");
  const runtime = read("components/offline/offline-runtime.tsx");
  assert.match(database, /mergeGuestData/);
  assert.match(database, /data: accountData/);
  assert.match(database, /idempotencyKey/);
  assert.match(database, /getPreparedGuestMigration/);
  assert.ok(runtime.indexOf('action: "complete"') < runtime.indexOf("clearOfflineOwner(migration.guestId)"));
  assert.match(runtime, /window\.confirm/);
  assert.match(runtime, /conflictCount: unresolved\.length/);
});

test("server completion requires every registered guest mutation receipt", () => {
  const route = read("app/api/offline/guest-migration/route.ts");
  assert.match(route, /guest_account_migration_items/);
  assert.match(route, /LEFT JOIN offline_mutation_receipts/);
  assert.match(route, /status='needs_review'/);
  assert.match(route, /missingReceipts/);
  assert.match(route, /status='completed'/);
});
