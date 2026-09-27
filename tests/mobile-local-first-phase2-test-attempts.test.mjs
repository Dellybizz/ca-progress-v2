import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

test("test attempts survive restart and stay isolated by account and academic context", async () => {
  const { LOCAL_MIGRATIONS, LOCAL_SCHEMA_VERSION } = await import("../packages/mobile-data/src/schema.ts");
  assert.equal(LOCAL_SCHEMA_VERSION, 7);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    for (const migration of LOCAL_MIGRATIONS) for (const statement of migration.statements) db.exec(statement.sql);
    db.prepare("INSERT INTO local_accounts(account_id,display_name,last_opened_at,created_at) VALUES(?,?,?,?)").run("one","One","2026-09-27","2026-09-27");
    db.prepare("INSERT INTO local_accounts(account_id,display_name,last_opened_at,created_at) VALUES(?,?,?,?)").run("two","Two","2026-09-27","2026-09-27");
    const insert=db.prepare("INSERT INTO local_test_attempts(local_id,account_id,academic_context_key,chapter_id,stage,marks_scored,marks_total,duration_minutes,completed_on,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
    insert.run("local-1","one","intermediate:jan-2027","chapter-1","test_1",63,100,90,"2026-09-27","same-retry-key","2026-09-27","2026-09-27");
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM local_test_attempts WHERE account_id=? AND academic_context_key=? AND state='pending'").get("one","intermediate:jan-2027").total,1);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM local_test_attempts WHERE account_id=? AND academic_context_key=?").get("two","intermediate:jan-2027").total,0);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM local_test_attempts WHERE account_id=? AND academic_context_key=?").get("one","intermediate:may-2027").total,0);
    assert.throws(()=>insert.run("duplicate","one","intermediate:jan-2027","chapter-1","test_1",63,100,90,"2026-09-27","same-retry-key","2026-09-27","2026-09-27"));
    db.prepare("UPDATE local_test_attempts SET state='synced',server_id=? WHERE local_id=?").run("server-1","local-1");
    assert.equal(db.prepare("SELECT server_id FROM local_test_attempts WHERE local_id=?").get("local-1").server_id,"server-1");
    db.prepare("DELETE FROM local_accounts WHERE account_id=?").run("one");
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM local_test_attempts").get().total,0);
  } finally { db.close(); }
});

test("queued test uploads retain their retry identity and are not marked synced before server confirmation",async()=>{
  const source=await readFile(new URL("../packages/mobile-data/src/local-tests.ts",import.meta.url),"utf8");
  assert.match(source,/idempotencyKey:row\.idempotency_key/);
  assert.match(source,/if\(!result\?\.attempt\?\.id\)throw/);
  assert.match(source,/UPDATE local_test_attempts SET state='synced'/);
  assert.match(source,/academic_context_key=\?/);
});

test("offline entry retries with one identity and only acknowledges a confirmed server attempt",async()=>{
  const { LOCAL_MIGRATIONS }=await import("../packages/mobile-data/src/schema.ts");
  const db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for(const migration of LOCAL_MIGRATIONS)for(const statement of migration.statements)db.exec(statement.sql);
  db.prepare("INSERT INTO local_accounts(account_id,display_name,last_opened_at,created_at) VALUES(?,?,?,?)").run("owner","Owner","2026-09-27","2026-09-27");
  db.prepare("INSERT INTO academic_catalog(local_id,account_id,academic_context_key,created_at,updated_at,entity_type,title,server_id) VALUES(?,?,?,?,?,'chapter',?,?)").run("chapter-local","owner","attempt-1","2026-09-27","2026-09-27","Chapter","chapter-server");
  globalThis.__phase2Db=db;
  try{
    const bridge=`export const query=async(sql,args=[])=>globalThis.__phase2Db.prepare(sql).all(...args);export const execute=async(sql,args=[])=>{globalThis.__phase2Db.prepare(sql).run(...args)};export const transaction=async(statements)=>{globalThis.__phase2Db.exec("BEGIN");try{for(const item of statements)globalThis.__phase2Db.prepare(item.sql).run(...(item.args||[]));globalThis.__phase2Db.exec("COMMIT")}catch(error){globalThis.__phase2Db.exec("ROLLBACK");throw error}};export const notifyLocalAccountChanged=()=>{};`;
    const result=await build({entryPoints:[new URL("../packages/mobile-data/src/local-tests.ts",import.meta.url).pathname],bundle:true,write:false,format:"esm",platform:"neutral",plugins:[{name:"sqlite-bridge",setup(plugin){plugin.onResolve({filter:/^\.\/(database|repository)$/},()=>({path:"bridge",namespace:"bridge"}));plugin.onLoad({filter:/.*/,namespace:"bridge"},()=>({contents:bridge,loader:"js"}));}}]});
    const attemptsApi=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
    await attemptsApi.recordLocalTestAttempt("owner","attempt-1",{chapterId:"chapter-server",stage:"test_1",marksScored:65,marksTotal:100,durationMinutes:90,completedOn:"2026-09-27"});
    const saved=await attemptsApi.readLocalTestAttempts("owner","attempt-1");assert.equal(saved.length,1);assert.equal(saved[0].state,"pending");
    assert.equal((await attemptsApi.readLocalTestAttempts("owner","other-attempt")).length,0);
    const sent=[];
    await assert.rejects(()=>attemptsApi.flushLocalTestAttempts("owner","attempt-1",async body=>{sent.push(body.idempotencyKey);throw Error("Offline");}),/Offline/);
    assert.equal((await attemptsApi.readLocalTestAttempts("owner","attempt-1"))[0].state,"pending");
    await attemptsApi.flushLocalTestAttempts("owner","attempt-1",async body=>{sent.push(body.idempotencyKey);return{attempt:{id:"server-attempt",attemptNumber:1}};});
    assert.deepEqual(sent,[saved[0].localId,saved[0].localId]);
    const confirmed=(await attemptsApi.readLocalTestAttempts("owner","attempt-1"))[0];assert.equal(confirmed.serverId,"server-attempt");assert.equal(confirmed.state,"synced");assert.equal(confirmed.lastError,null);
    assert.equal(await attemptsApi.flushLocalTestAttempts("owner","attempt-1",async()=>{throw Error("Duplicate upload");}),0);
  }finally{delete globalThis.__phase2Db;db.close();}
});
