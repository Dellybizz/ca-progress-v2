import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

test("offline resources track pin, bytes, version drift and retry the same transfer",async()=>{
  const {LOCAL_MIGRATIONS}=await import("../packages/mobile-data/src/schema.ts");
  const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");
  for(const migration of LOCAL_MIGRATIONS)for(const statement of migration.statements)db.exec(statement.sql);
  db.prepare("INSERT INTO local_accounts(account_id,display_name,last_opened_at,created_at) VALUES(?,?,?,?)").run("owner","Owner","2026-09-28","2026-09-28");
  globalThis.__phase4Db=db;
  try{
    const bridge=`export const query=async(sql,args=[])=>globalThis.__phase4Db.prepare(sql).all(...args);export const execute=async(sql,args=[])=>{globalThis.__phase4Db.prepare(sql).run(...args)};export const transaction=async(statements)=>{globalThis.__phase4Db.exec("BEGIN");try{for(const item of statements)globalThis.__phase4Db.prepare(item.sql).run(...(item.args||[]));globalThis.__phase4Db.exec("COMMIT")}catch(error){globalThis.__phase4Db.exec("ROLLBACK");throw error}};`;
    const built=await build({entryPoints:[new URL("../packages/mobile-data/src/resources.ts",import.meta.url).pathname],bundle:true,write:false,format:"esm",platform:"neutral",plugins:[{name:"sqlite-bridge",setup(plugin){plugin.onResolve({filter:/^\.\/database$/},()=>({path:"bridge",namespace:"bridge"}));plugin.onLoad({filter:/.*/,namespace:"bridge"},()=>({contents:bridge,loader:"js"}));}}]});
    const resources=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString("base64")}`);
    const metadata={id:"resource-1",ownerId:"owner",title:"Workbook",filename:"workbook.pdf",mimeType:"application/pdf",byteSize:1234,updatedAt:"2026-09-28",checksum:"hash-old"};
    await resources.storeResourceMetadata("owner",[metadata]);
    const [first]=await resources.readResources("owner");assert.equal(first.pinned,false);
    const started=await resources.beginFileTransfer("owner",first,"download");
    await resources.updateFileTransfer("owner",started.transferId,{state:"paused",bytesComplete:50});
    const retry=await resources.beginFileTransfer("owner",first,"download");assert.equal(retry.transferId,started.transferId);
    await resources.completeDownload("owner",first,retry.transferId,{fileId:"file-1",nativePath:"private/file-1",byteSize:1234,checksum:"hash-old"});
    const [saved]=await resources.readResources("owner");assert.equal(saved.syncState,"available");
    await resources.setResourcePinned("owner",saved,true);
    assert.deepEqual(await resources.readOfflineStorageSummary("owner"),{bytes:1234,files:1,pinned:1});
    await resources.storeResourceMetadata("owner",[{...metadata,updatedAt:"2026-09-29",checksum:"hash-new"}]);
    const [outdated]=await resources.readResources("owner");assert.equal(outdated.syncState,"outdated");assert.equal(outdated.localFileId,"file-1");assert.equal(outdated.pinned,true);
    const updated=await resources.beginFileTransfer("owner",outdated,"download");
    await resources.completeDownload("owner",outdated,updated.transferId,{fileId:"file-2",nativePath:"private/file-2",byteSize:1200,checksum:"hash-new"});
    assert.deepEqual(await resources.readUnreferencedFileIds("owner"),["file-1"]);
    await resources.removeSupersededFileIndex("owner","file-1");
    assert.deepEqual(await resources.readOfflineStorageSummary("owner"),{bytes:1200,files:1,pinned:1});
    assert.deepEqual(await resources.readResources("other-account"),[]);
  }finally{delete globalThis.__phase4Db;db.close();}
});

test("UI removal calls the native vault before clearing the file index",async()=>{
  const source=await readFile(new URL("../apps/mobile/src/files.ts",import.meta.url),"utf8");
  assert.match(source,/await FileVault\.remove\(\{accountId,fileId:resource\.localFileId\}\);await removeLocalFile/);
});
