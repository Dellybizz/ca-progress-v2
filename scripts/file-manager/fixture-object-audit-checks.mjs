import assert from 'node:assert/strict';
import {auditFixtureObjects,FIXTURE_SIZE} from './fixture-object-audit.mjs';
const owner='11111111-1111-4111-8111-111111111111',intent='22222222-2222-4222-8222-222222222222';
const key=`files/${owner}/${intent}/upload-verification.pdf`;
const bytes=new Uint8Array(FIXTURE_SIZE).fill(32);bytes.set(new TextEncoder().encode('%PDF-1.7\n'));bytes.set(new TextEncoder().encode('\n%%EOF'),bytes.length-6);
function fixture({referenced=false,changed=false,enabled=false,wrongBytes=false,otherKey=false,wrongOwner=false,failDelete=false}={}){
 let present=true,deletes=0,sql='';const DB={prepare(query){sql=query;return{bind(){return this;},async all(){assert.match(sql,/03:06:00Z/);assert.match(sql,/03:07:00Z/);return{results:[{user_id:wrongOwner?'not-a-uuid':owner,username:'upload_aabbccddeeff'}]};},async first(){return sql.includes('still-never')?null:sql.includes('SELECT 1 ok')?enabled?null:{ok:1}:referenced?{found:1}:null;}};}};
 const BUCKET={async list(){return {objects:present?[{key:otherKey?key.replace('upload-verification.pdf','student.pdf'):key,size:FIXTURE_SIZE}]:[],truncated:false};},async get(){return {size:FIXTURE_SIZE,etag:'original',arrayBuffer:async()=>wrongBytes?new Uint8Array(FIXTURE_SIZE).buffer:bytes.buffer};},async head(){return present?{size:FIXTURE_SIZE,etag:changed?'changed':'original'}:null;},async delete(){deletes++;if(!failDelete)present=false;}};
 return {DB,BUCKET,get deletes(){return deletes;}};
}
const audit=fixture();assert.equal((await auditFixtureObjects(audit)).verified_orphans,1);assert.equal(audit.deletes,0);
const clean=fixture();const result=await auditFixtureObjects(clean,{apply:true});assert.equal(result.deleted,1);assert.equal(result.remaining_verified_orphans,0);
for(const flags of [{referenced:true},{changed:true},{enabled:true},{wrongBytes:true},{otherKey:true}]){const f=fixture(flags);await auditFixtureObjects(f,{apply:true});assert.equal(f.deletes,0,JSON.stringify(flags));}
await assert.rejects(auditFixtureObjects(fixture({wrongOwner:true}),{apply:true}),/identity mismatch/);
await assert.rejects(auditFixtureObjects(fixture({failDelete:true}),{apply:true}),/could not be verified/);
console.log('PASS fixture cleanup guards: dry run, exact identity/bytes, no references, inactive account, unchanged object, verified deletion');

// Exercise the actual selection/reference SQL rather than trusting stubbed predicates.
const {DatabaseSync}=await import('node:sqlite');const sqlite=new DatabaseSync(':memory:');
try{
 sqlite.exec(`CREATE TABLE app_users(user_id TEXT,auth_provider TEXT,account_state TEXT,created_at TEXT);CREATE TABLE profiles(user_id TEXT,display_name TEXT);CREATE TABLE account_usernames(user_id TEXT,username TEXT);CREATE TABLE uploaded_resources(storage_path TEXT);CREATE TABLE r2_upload_intents(object_key TEXT);CREATE TABLE test_attempt_attachments(object_key TEXT);CREATE TABLE test_attachment_upload_intents(object_key TEXT);CREATE TABLE resource_inspections(source_key TEXT);CREATE TABLE storage_cleanup_deletions(object_key TEXT);`);
 sqlite.prepare('INSERT INTO app_users VALUES(?,?,?,?)').run(owner,'manual-test','disabled','2026-10-15 03:06:30');sqlite.prepare('INSERT INTO profiles VALUES(?,?)').run(owner,'Upload verification fixture');sqlite.prepare('INSERT INTO account_usernames VALUES(?,?)').run(owner,'upload_aabbccddeeff');
 for(const [id,provider,state,time]of [['student','google','disabled','2026-10-15 03:06:30'],['active','manual-test','active','2026-10-15 03:06:30'],['later','manual-test','disabled','2026-10-15 03:07:01']]){sqlite.prepare('INSERT INTO app_users VALUES(?,?,?,?)').run(id,provider,state,time);sqlite.prepare('INSERT INTO profiles VALUES(?,?)').run(id,'Upload verification fixture');sqlite.prepare('INSERT INTO account_usernames VALUES(?,?)').run(id,'upload_aabbccddeeff');}
 const statement=(sql,values=[])=>({bind(...args){return statement(sql,args);},async all(){return{results:sqlite.prepare(sql).all(...values)};},async first(){return sqlite.prepare(sql).get(...values)||null;}});const DB={prepare:statement};
 for(const [table,column]of [['uploaded_resources','storage_path'],['r2_upload_intents','object_key'],['test_attempt_attachments','object_key'],['test_attachment_upload_intents','object_key'],['resource_inspections','source_key'],['storage_cleanup_deletions','object_key']]){
  sqlite.prepare(`INSERT INTO ${table}(${column})VALUES(?)`).run(key);const f=fixture();const report=await auditFixtureObjects({DB,BUCKET:f.BUCKET},{apply:true});assert.equal(report.fixture_accounts,1);assert.equal(f.deletes,0);sqlite.exec(`DELETE FROM ${table}`);
 }
 const f=fixture();assert.equal((await auditFixtureObjects({DB,BUCKET:f.BUCKET},{apply:true})).deleted,1);
 console.log('PASS actual SQL excludes real/active/out-of-window accounts and preserves every referenced object class');
}finally{sqlite.close();}
