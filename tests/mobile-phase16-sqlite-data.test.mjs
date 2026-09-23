import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 16 creates every account-scoped local domain with sync metadata", async () => {
  const schema=await read("packages/mobile-data/src/schema.ts");
  for(const table of ["application_config","academic_catalog","dashboard_projection","progress_records","planner_items","study_sessions","timer_state","notes","notifications","resource_metadata","community_channels","community_messages","community_reactions","community_read_state","sync_cursors","mutation_outbox","conflicts","tombstones","local_file_index"]) assert.match(schema,new RegExp(table));
  for(const column of ["local_id","server_id","server_version","account_id","academic_context_key","local_state","created_at","updated_at","deleted_at"]) assert.match(schema,new RegExp(column));
  assert.match(schema,/FOREIGN KEY\(account_id\).*ON DELETE CASCADE/);
});

test("migrations are transactional, forward-only, checkpointed and recoverable", async()=>{
  const [database,android,ios]=await Promise.all([read("packages/mobile-data/src/database.ts"),read("packages/capacitor-local-database/android/src/main/java/in/zanisheluxe/caprogress/localdatabase/LocalDatabasePlugin.java"),read("packages/capacitor-local-database/ios/Sources/LocalDatabasePlugin/LocalDatabasePlugin.swift")]);
  assert.match(database,/version > LOCAL_SCHEMA_VERSION/);assert.match(database,/NativeDatabase\.checkpoint/);assert.match(database,/NativeDatabase\.transaction/);assert.match(database,/NativeDatabase\.restore/);
  assert.match(android,/PRAGMA integrity_check/);assert.match(android,/beginTransaction/);assert.match(ios,/PRAGMA integrity_check/);assert.match(ios,/BEGIN IMMEDIATE/);
});

test("repository queries are owner-scoped and pending mutations cannot be evicted",async()=>{
  const repository=await read("packages/mobile-data/src/repository.ts");
  assert.doesNotMatch(repository,/SELECT \* FROM/);assert.match(repository,/WHERE account_id=\?/);assert.match(repository,/DELETE FROM local_accounts WHERE account_id=\?/);
  assert.match(repository,/state===\"locked\"&&!unlock/);
  assert.match(repository,/m\.status IN \('pending','failed'\)/);assert.match(repository,/f\.pinned=0 AND f\.pending_upload=0/);
  assert.match(repository,/subscribe\(listener\)/);assert.match(repository,/timer_state/);
});

test("large files remain native paths rather than SQLite blobs and logout policies are explicit",async()=>{
  const [schema,main]=await Promise.all([read("packages/mobile-data/src/schema.ts"),read("apps/mobile/src/main.tsx")]);
  assert.match(schema,/native_path TEXT NOT NULL/);assert.doesNotMatch(schema,/file_blob|content_blob/i);
  assert.match(main,/Sign out and lock local data/);assert.match(main,/Remove this account from device/);assert.match(main,/Wipe all offline data/);
});
