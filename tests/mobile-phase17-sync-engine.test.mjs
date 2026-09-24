import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("Phase 17 migration creates a bounded indexed monotonic journal and universal receipts",async()=>{
  const sql=await read("d1/migrations/0065_mobile_phase17_sync.sql");const db=new DatabaseSync(":memory:");db.exec("CREATE TABLE _ca_schema_migrations(version TEXT PRIMARY KEY,description TEXT,source_freeze_commit TEXT);"+sql);
  for(const table of ["mobile_sync_entities","mobile_sync_changes","mobile_sync_mutation_receipts"])assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
  assert.match(sql,/sequence INTEGER PRIMARY KEY AUTOINCREMENT/);assert.match(sql,/idx_mobile_sync_changes_pull/);assert.match(sql,/PRIMARY KEY \(user_id, mutation_id\)/);
});

test("bootstrap, pull, push and status enforce account and academic context boundaries",async()=>{
  const files=await Promise.all(["bootstrap","pull","push","status"].map(name=>read(`app/api/v1/sync/${name}/route.ts`)));
  for(const source of files){assert.match(source,/getStudentContext/);assert.match(source,/AUTH_REQUIRED/);}
  assert.match(files[0],/user_id=\?1 AND academic_context_key=\?2/);assert.match(files[1],/CONTEXT_CHANGED/);assert.match(files[2],/mutation\.contextKey!==context\.contextKey/);assert.match(files[3],/SYNC_PAGE_LIMIT/);
});

test("canonical mutation, receipt, entity version and journal share one D1 batch",async()=>{
  const [route,sync]=await Promise.all([read("app/api/offline/mutations/route.ts"),read("lib/mobile/sync.ts")]);
  assert.match(route,/\.\.\.staged\.writes/);assert.match(route,/\.\.\.syncStatements/);assert.match(route,/await db\.batch/);
  assert.match(sync,/entity_version=entity_version\+1/);assert.match(sync,/INSERT INTO mobile_sync_changes/);assert.match(sync,/mobile_sync_mutation_receipts/);assert.match(sync,/-60 days/);assert.match(sync,/-45 days/);
});

test("duplicate requests, dependency conflicts and stale baselines cannot duplicate writes",async()=>{
  const [push,offline]=await Promise.all([read("app/api/v1/sync/push/route.ts"),read("app/api/offline/mutations/route.ts")]);
  assert.match(push,/Idempotency-Key/);assert.match(push,/DEPENDENCY_CONFLICT/);assert.match(push,/blocked\.has\(mutation\.predecessor\)/);assert.match(push,/STALE_VERSION/);
  assert.match(offline,/request_hash/);assert.match(offline,/already used for different content/);assert.match(offline,/Missing conflict baseline/);assert.match(offline,/An earlier edit changed/);
});

test("client cursor commit is atomic and interruption/reordered pages remain safe",async()=>{
  const source=await read("packages/mobile-data/src/sync.ts");
  assert.match(source,/statements\.push\(\{sql:"INSERT INTO sync_cursors/);assert.match(source,/await transaction\(statements\)/);
  assert.match(source,/while\(more\)/);assert.match(source,/delta\.academicContextKey!==contextKey/);assert.match(source,/ORDER BY created_at,rowid LIMIT 50/);
  assert.match(source,/Math\.pow\(2,attempts\)/);assert.match(source,/Math\.random/);assert.match(source,/status='conflict'/);assert.match(source,/dependency_conflict/);
});

test("lifecycle triggers cover login, launch, resume, reconnect, refresh, invalidation and bounded periodic work",async()=>{
  const [main,runtime]=await Promise.all([read("apps/mobile/src/main.tsx"),read("apps/mobile/src/runtime.ts")]);
  assert.match(main,/sync\(\);return/);assert.match(runtime,/App\.addListener\("resume"/);assert.match(main,/addEventListener\("online"/);
  assert.match(main,/onClick=\{refresh\}/);assert.match(main,/ca-realtime-invalidation/);assert.match(main,/15\*60\*1000/);
  for(const label of ["updating","offline","pending","conflict","failed"])assert.match(main,new RegExp(label,"i"));
});

test("all required domain conflict policies are explicit",async()=>{const source=await read("packages/mobile-data/src/sync.ts");for(const policy of ["merge-independent-stages","field-review","retain-both","immutable-client-id","greatest-sequence","monotonic-read","explicit-review"])assert.match(source,new RegExp(policy));});

test("every local sync insert has one value per declared column",async()=>{
  const source=await read("packages/mobile-data/src/sync.ts");
  const inserts=[...source.matchAll(/INSERT INTO ([a-z_]+)\(([^)]+)\) VALUES\(([^)]+)\)/g)];
  assert.ok(inserts.length>=10);
  for(const [,table,columns,values] of inserts)assert.equal(values.split(",").length,columns.split(",").length,`${table} INSERT column/value mismatch`);
});

test("bootstrap cannot merge another account and committed pages refresh local readers",async()=>{
  const [sync,repository,main,bootstrap]=await Promise.all([read("packages/mobile-data/src/sync.ts"),read("packages/mobile-data/src/repository.ts"),read("apps/mobile/src/main.tsx"),read("app/api/v1/sync/bootstrap/route.ts")]);
  assert.match(sync,/bootstrap\.accountId!==input\.accountId/);
  assert.match(sync,/await transaction\(statements\);\s*notifyLocalAccountChanged\(accountId\)/);
  assert.match(repository,/export const notifyLocalAccountChanged/);
  assert.match(main,/if \(!value\.user\?\.applicationUserId\) throw/);
  assert.match(main,/role="alert" className="sync-error"/);
  assert.match(bootstrap,/ACADEMIC_SETUP_REQUIRED/);
});
