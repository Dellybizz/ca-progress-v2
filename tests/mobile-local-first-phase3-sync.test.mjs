import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

test("bootstrap captures the journal boundary before collecting the snapshot",async()=>{
  const source=await readFile(new URL("../app/api/v1/sync/bootstrap/route.ts",import.meta.url),"utf8");
  const boundary=source.indexOf("const high=(await db.prepare");
  const snapshot=source.indexOf("const settled=await Promise.allSettled");
  assert.ok(boundary>0&&snapshot>boundary);
});

test("server deletion retains a pending device edit, records a conflict and advances the cursor atomically",async()=>{
  const {LOCAL_MIGRATIONS}=await import("../packages/mobile-data/src/schema.ts");
  const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");
  for(const migration of LOCAL_MIGRATIONS)for(const statement of migration.statements)db.exec(statement.sql);
  db.prepare("INSERT INTO local_accounts(account_id,display_name,last_opened_at,created_at) VALUES(?,?,?,?)").run("owner","Owner","2026-09-27","2026-09-27");
  db.prepare("INSERT INTO sync_cursors(account_id,scope,cursor,updated_at) VALUES(?,?,?,?)").run("owner","context-1","1","2026-09-27");
  db.prepare("INSERT INTO progress_records(local_id,server_id,account_id,academic_context_key,local_state,created_at,updated_at,chapter_id,payload_json) VALUES(?,?,?,?,'pending',?,?,?,?)").run("owner:progress:chapter","chapter","owner","context-1","2026-09-27","2026-09-27","chapter",'{"completedAt":"2026-09-27"}');
  globalThis.__phase3Db=db;
  try{
    const bridge=`export const query=async(sql,args=[])=>globalThis.__phase3Db.prepare(sql).all(...args);export const execute=async(sql,args=[])=>{globalThis.__phase3Db.prepare(sql).run(...args)};export const transaction=async(statements)=>{globalThis.__phase3Db.exec("BEGIN");try{for(const item of statements)globalThis.__phase3Db.prepare(item.sql).run(...(item.args||[]));globalThis.__phase3Db.exec("COMMIT")}catch(error){globalThis.__phase3Db.exec("ROLLBACK");throw error}};export const notifyLocalAccountChanged=()=>{};`;
    const result=await build({entryPoints:[new URL("../packages/mobile-data/src/sync.ts",import.meta.url).pathname],bundle:true,write:false,format:"esm",platform:"neutral",plugins:[{name:"sqlite-bridge",setup(plugin){plugin.onResolve({filter:/^\.\/(database|repository)$/},()=>({path:"bridge",namespace:"bridge"}));plugin.onLoad({filter:/.*/,namespace:"bridge"},()=>({contents:bridge,loader:"js"}));}}]});
    const {createSyncCoordinator}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
    const entity={entity_type:"progress",entity_id:"chapter",entity_version:2,payload_json:null,operation:"delete",deleted_at:"2026-09-27T12:00:00.000Z"};
    const coordinator=createSyncCoordinator({accountId:"owner",transport:async path=>path==="/api/v1/sync/bootstrap"?{accountId:"owner",academicContextKey:"context-1",cursor:"10",entities:[entity]}:{academicContextKey:"context-1",cursor:"10",hasMore:false,changes:[]}});
    await coordinator.synchronize();
    const row=db.prepare("SELECT local_state,deleted_at FROM progress_records WHERE local_id=?").get("owner:progress:chapter");
    assert.equal(row.local_state,"pending");assert.equal(row.deleted_at,null);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM conflicts WHERE account_id=? AND resolved_at IS NULL").get("owner").total,1);
    assert.equal(db.prepare("SELECT cursor FROM sync_cursors WHERE account_id=? AND scope=?").get("owner","context-1").cursor,"10");
    const conflictBuild=await build({entryPoints:[new URL("../packages/mobile-data/src/conflicts.ts",import.meta.url).pathname],bundle:true,write:false,format:"esm",platform:"neutral",plugins:[{name:"sqlite-bridge",setup(plugin){plugin.onResolve({filter:/^\.\/(database|repository)$/},()=>({path:"bridge",namespace:"bridge"}));plugin.onLoad({filter:/.*/,namespace:"bridge"},()=>({contents:bridge,loader:"js"}));}}]});
    const conflicts=await import(`data:text/javascript;base64,${Buffer.from(conflictBuild.outputFiles[0].contents).toString("base64")}`);
    const [choice]=await conflicts.readOpenConflicts("owner");assert.equal(choice.entityType,"progress");
    await conflicts.acceptServerConflict("owner",choice.id);
    assert.equal((await conflicts.readOpenConflicts("owner")).length,0);
    assert.equal(db.prepare("SELECT local_state FROM progress_records WHERE local_id=?").get("owner:progress:chapter").local_state,"synced");
  }finally{delete globalThis.__phase3Db;db.close();}
});
