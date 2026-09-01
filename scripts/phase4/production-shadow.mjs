import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { PHASE4_TABLES, REPRESENTATIVE_USER_TABLES, INTENTIONAL_SQLITE_DIFFERENCES } from "./manifest.mjs";
import { buildUpsert, hashRows, normalizeRow, quoteIdentifier, rowKey, sha256, splitSqlStatements, stableStringify } from "./core.mjs";

const required=["NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","CLOUDFLARE_ACCOUNT_ID","CLOUDFLARE_API_TOKEN"];
for(const key of required) if(!process.env[key]) throw new Error(`Phase 4 requires ${key}`);
const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/,"");
const supabaseKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
const accountId=process.env.CLOUDFLARE_ACCOUNT_ID;
const cloudflareToken=process.env.CLOUDFLARE_API_TOKEN;
const d1Name=process.env.PHASE4_D1_NAME || "ca-progress-v2-phase4-shadow";
const r2Bucket=process.env.PHASE4_R2_BUCKET || "ca-progress-v2-staging-user-resources";
const runId=process.env.PHASE4_RUN_ID || "phase4-production-shadow-v1";
const mode=process.argv.includes("--rollback") ? "rollback" : process.argv.includes("--reconcile-only") ? "reconcile" : "migrate";
const pageSize=Number(process.env.PHASE4_PAGE_SIZE || 200);
const report={phase:4,mode,runId,d1Name,r2Bucket,startedAt:new Date().toISOString(),tables:[],storage:{sourceObjects:0,copied:0,verified:0,failed:0,preexistingR2References:0},representativeUsers:[],intentionalDifferences:INTENTIONAL_SQLITE_DIFFERENCES,failures:[],discrepancies:[]};

function headers(extra={}){return {apikey:supabaseKey,Authorization:`Bearer ${supabaseKey}`,...extra};}
async function sourceFetch(path,init={}){ const response=await fetch(`${supabaseUrl}${path}`,{...init,headers:{...headers(),...(init.headers||{})}}); return response; }
async function fetchPublicTable(table,order=[]){
  const rows=[]; let offset=0;
  while(true){
    const params=new URLSearchParams({select:"*",limit:String(pageSize),offset:String(offset)});
    if(order.length) params.set("order",order.map((column)=>`${column}.asc`).join(","));
    const response=await sourceFetch(`/rest/v1/${encodeURIComponent(table)}?${params}`);
    if(response.status===404){ const text=await response.text(); if(/PGRST205|Could not find the table|does not exist/i.test(text)) return null; throw new Error(`${table} source fetch failed: ${response.status} ${text.slice(0,240)}`); }
    if(!response.ok) throw new Error(`${table} source fetch failed: ${response.status} ${(await response.text()).slice(0,240)}`);
    const page=await response.json(); rows.push(...page); if(page.length<pageSize) break; offset+=page.length;
  }
  return rows;
}
async function fetchAuthUsers(){
  const users=[]; let page=1;
  while(true){ const response=await sourceFetch(`/auth/v1/admin/users?page=${page}&per_page=1000`); if(!response.ok) throw new Error(`Supabase admin users failed: ${response.status}`); const body=await response.json(); users.push(...(body.users||[])); if(!body.next_page || body.next_page===page) break; page=body.next_page; }
  return users;
}
async function cf(path,init={}){
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`,{...init,headers:{Authorization:`Bearer ${cloudflareToken}`,"Content-Type":"application/json",...(init.headers||{})}});
  const body=await response.json().catch(()=>({})); if(!response.ok||body.success===false) throw new Error(`Cloudflare API ${path} failed: ${response.status} ${stableStringify(body.errors||body).slice(0,500)}`); return body.result;
}
async function ensureD1(){
  const listed=await cf(`/d1/database?name=${encodeURIComponent(d1Name)}`); const existing=Array.isArray(listed)?listed.find((db)=>db.name===d1Name):null;
  if(existing) return existing.uuid || existing.id;
  const created=await cf(`/d1/database`,{method:"POST",body:JSON.stringify({name:d1Name})}); return created.uuid || created.id;
}
let databaseId;
async function d1(sql,params=[]){ const result=await cf(`/d1/database/${databaseId}/query`,{method:"POST",body:JSON.stringify({sql,params})}); const first=Array.isArray(result)?result[0]:result; if(first?.success===false) throw new Error(`D1 query failed: ${stableStringify(first)}`); return first?.results||[]; }
async function tableInfo(table){ return d1(`PRAGMA table_info(${quoteIdentifier(table)});`); }
async function migrationApplied(version){ try{return (await d1(`SELECT 1 AS ok FROM _ca_schema_migrations WHERE version=?1 LIMIT 1`,[version])).length>0;}catch{return false;} }
async function applySchema(){
  const dir=join(process.cwd(),"d1","migrations");
  for(const file of readdirSync(dir).filter((name)=>/^\d+.*\.sql$/.test(name)).sort()){
    const version=file.match(/^(\d+)/)?.[1]; if(version&&await migrationApplied(version)) continue;
    const sql=readFileSync(join(dir,file),"utf8");
    for(const statement of splitSqlStatements(sql)){
      const alter=statement.match(/ALTER\s+TABLE\s+([A-Za-z0-9_]+)\s+ADD\s+COLUMN\s+([A-Za-z0-9_]+)/i);
      if(alter){ const columns=await tableInfo(alter[1]); if(columns.some((row)=>row.name===alter[2])) continue; }
      await d1(statement);
    }
    if(version && !(await migrationApplied(version))) throw new Error(`Migration ${file} did not record version ${version}`);
  }
}
async function upsert(table,row,pk){ const statement=buildUpsert(table,row,pk); await d1(statement.sql,statement.params); }
async function checkpoint(spec,patch){
  const current=(await d1(`SELECT * FROM phase4_migration_checkpoints WHERE run_id=?1 AND source_table=?2 AND target_table=?3`,[runId,spec.source,spec.source]))[0]||{};
  const row={run_id:runId,source_table:spec.source,target_table:spec.source,next_offset:patch.next_offset??current.next_offset??0,source_count:patch.source_count??current.source_count??null,migrated_count:patch.migrated_count??current.migrated_count??0,failed_count:patch.failed_count??current.failed_count??0,source_hash:patch.source_hash??current.source_hash??null,target_hash:patch.target_hash??current.target_hash??null,status:patch.status??current.status??"pending",updated_at:new Date().toISOString()};
  await upsert("phase4_migration_checkpoints",row,["run_id","source_table","target_table"]); return row;
}
async function recordFailure(spec,row,error){
  const key=rowKey(row,spec.pk); const normalized=normalizeRow(row); const item={table:spec.source,rowKey:key,rowHash:sha256(normalized),error:error instanceof Error?error.message:String(error)}; report.failures.push(item);
  await upsert("phase4_migration_failures",{run_id:runId,source_table:spec.source,row_key:key,row_hash:item.rowHash,error_code:"ROW_MIGRATION_FAILED",error_message:item.error.slice(0,1000),created_at:new Date().toISOString()},["run_id","source_table","row_key"]);
}
function prepareRow(row,targetColumns,deferred=[]){
  const normalized=normalizeRow(row); const missing=Object.keys(normalized).filter((key)=>!targetColumns.includes(key)); if(missing.length) throw new Error(`Source columns absent from D1 target: ${missing.join(",")}`);
  const output={}; for(const [key,value] of Object.entries(normalized)) output[key]=deferred.includes(key)?null:value; return output;
}
async function targetRows(spec,columns){ const list=columns.map(quoteIdentifier).join(","); const order=spec.pk.map(quoteIdentifier).join(","); return d1(`SELECT ${list} FROM ${quoteIdentifier(spec.source)} ORDER BY ${order}`); }
async function migrateTable(spec){
  const source=await fetchPublicTable(spec.source,spec.pk);
  if(source===null){
    if(!spec.optionalSource) throw new Error(`Required source table ${spec.source} is absent`);
    const targetCount=(await d1(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(spec.source)}`))[0]?.count||0;
    if(Number(targetCount)!==0) report.discrepancies.push({table:spec.source,kind:"source_absent_target_nonempty",targetCount:Number(targetCount)});
    await checkpoint(spec,{status:"source_absent",source_count:0,next_offset:0,migrated_count:0,source_hash:sha256("")}); report.tables.push({domain:spec.domain,table:spec.source,status:"source_absent",sourceCount:0,targetCount:Number(targetCount)}); return;
  }
  const info=await tableInfo(spec.source); if(!info.length) throw new Error(`D1 target table ${spec.source} is absent`); const columns=info.map((row)=>row.name);
  const normalizedFull=source.map(normalizeRow); const sourceHash=hashRows(normalizedFull,spec.pk); const existing=(await d1(`SELECT * FROM phase4_migration_checkpoints WHERE run_id=?1 AND source_table=?2`,[runId,spec.source]))[0];
  if(existing?.status==="complete"){ if(existing.source_hash!==sourceHash) throw new Error(`${spec.source} changed after its completed checkpoint; start a new Phase 4 run id`); report.tables.push({domain:spec.domain,table:spec.source,status:"resumed-complete",sourceCount:source.length,targetCount:source.length,sourceHash,targetHash:existing.target_hash}); return; }
  let offset=Number(existing?.next_offset||0), migrated=Number(existing?.migrated_count||0), failed=Number(existing?.failed_count||0); await checkpoint(spec,{status:"running",source_count:source.length,source_hash:sourceHash,next_offset:offset,migrated_count:migrated,failed_count:failed});
  for(let index=offset;index<source.length;index++){
    try{ const row=prepareRow(source[index],columns,spec.deferred||[]); await upsert(spec.source,row,spec.pk); migrated++; }
    catch(error){ failed++; await recordFailure(spec,source[index],error); }
    await checkpoint(spec,{status:"running",source_count:source.length,source_hash:sourceHash,next_offset:index+1,migrated_count:migrated,failed_count:failed});
  }
  if(spec.deferred?.length){
    for(const sourceRow of source){ for(const column of spec.deferred){ if(sourceRow[column]===null||sourceRow[column]===undefined) continue; const where=spec.pk.map((key,index)=>`${quoteIdentifier(key)}=?${index+2}`).join(" AND "); await d1(`UPDATE ${quoteIdentifier(spec.source)} SET ${quoteIdentifier(column)}=?1 WHERE ${where}`,[normalizeRow(sourceRow)[column],...spec.pk.map((key)=>normalizeRow(sourceRow)[key])]); } }
  }
  const comparable=columns.filter((column)=>normalizedFull.length===0||Object.hasOwn(normalizedFull[0],column)); const target=await targetRows(spec,comparable.length?comparable:spec.pk); const targetHash=hashRows(target,spec.pk); const targetCount=Number((await d1(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(spec.source)}`))[0]?.count||0);
  const equivalent=failed===0&&source.length===targetCount&&sourceHash===targetHash; if(!equivalent) report.discrepancies.push({table:spec.source,kind:"table_reconciliation",sourceCount:source.length,targetCount,sourceHash,targetHash,failed});
  await checkpoint(spec,{status:equivalent?"complete":"failed",source_count:source.length,source_hash:sourceHash,target_hash:targetHash,next_offset:source.length,migrated_count:migrated,failed_count:failed});
  report.tables.push({domain:spec.domain,table:spec.source,status:equivalent?"complete":"failed",sourceCount:source.length,targetCount,sourceHash,targetHash,failed});
}
async function migrateIdentity(){
  const [users,admins]=await Promise.all([fetchAuthUsers(),fetchPublicTable("admin_users",["user_id"])]); const adminMap=new Map((admins||[]).filter((row)=>row.is_active!==false).map((row)=>[row.user_id,row.role]));
  for(const user of users){
    const role=adminMap.get(user.id)||"student"; const state=user.deleted_at?"deleted":(user.banned_until&&Date.parse(user.banned_until)>Date.now()?"disabled":"active");
    await upsert("app_users",{user_id:user.id,auth_provider:"supabase-auth",provider_subject:user.id,account_state:state,created_at:user.created_at||new Date().toISOString(),updated_at:user.updated_at||user.created_at||new Date().toISOString(),role},["user_id"]);
    await upsert("auth_identities",{identity_id:`supabase-auth:${user.id}`,provider:"supabase_auth",provider_user_id:user.id,application_user_id:user.id,email:user.email||null,phone:user.phone||null,display_name:user.user_metadata?.full_name||user.user_metadata?.name||null,avatar_url:user.user_metadata?.avatar_url||null,email_verified:user.email_confirmed_at?1:0,last_seen_at:user.last_sign_in_at||null,created_at:user.created_at||new Date().toISOString(),updated_at:user.updated_at||user.created_at||new Date().toISOString()},["identity_id"]);
  }
  const target=Number((await d1("SELECT COUNT(*) AS count FROM app_users"))[0]?.count||0); const identities=Number((await d1("SELECT COUNT(*) AS count FROM auth_identities WHERE provider='supabase_auth'"))[0]?.count||0); if(target!==users.length||identities!==users.length) report.discrepancies.push({table:"app_users/auth_identities",kind:"identity_count",sourceCount:users.length,targetUsers:target,targetIdentities:identities});
  report.tables.push({domain:"identity",table:"auth.users -> app_users/auth_identities",status:target===users.length&&identities===users.length?"complete":"failed",sourceCount:users.length,targetCount:target,identityCount:identities});
  return users;
}
async function listStorageObjects(){
  const response=await sourceFetch("/storage/v1/bucket"); if(!response.ok) throw new Error(`Storage bucket list failed: ${response.status}`); const buckets=await response.json(); const objects=[];
  async function walk(bucket,prefix=""){
    let offset=0; while(true){ const res=await sourceFetch(`/storage/v1/object/list/${encodeURIComponent(bucket.id)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prefix,limit:100,offset,sortBy:{column:"name",order:"asc"}})}); if(!res.ok) throw new Error(`Storage list ${bucket.id}/${prefix} failed: ${res.status}`); const page=await res.json(); for(const item of page){ const name=prefix?`${prefix}/${item.name}`:item.name; if(item.id) objects.push({bucket:bucket.id,name,...item}); else await walk(bucket,name); } if(page.length<100) break; offset+=page.length; }
  }
  for(const bucket of buckets) await walk(bucket); return objects;
}
function wrangler(args,options={}){ const executable=process.platform==="win32"?"npx.cmd":"npx"; return execFileSync(executable,["wrangler",...args],{cwd:process.cwd(),env:process.env,stdio:options.stdio||["ignore","pipe","pipe"],encoding:options.encoding}); }
async function migrateStorage(){
  const objects=await listStorageObjects(); report.storage.sourceObjects=objects.length; const existing=await fetchPublicTable("uploaded_resources",["id"]); report.storage.preexistingR2References=existing?.length||0;
  if(mode==="reconcile") return;
  const temp=mkdtempSync(join(tmpdir(),"ca-progress-phase4-r2-"));
  try{ for(const object of objects){
    const targetKey=`phase4-shadow/supabase/${object.bucket}/${object.name}`; const path=join(temp,sha256(`${object.bucket}/${object.name}`));
    try{ const download=await sourceFetch(`/storage/v1/object/authenticated/${encodeURIComponent(object.bucket)}/${object.name.split("/").map(encodeURIComponent).join("/")}`); if(!download.ok) throw new Error(`download ${download.status}`); const bytes=Buffer.from(await download.arrayBuffer()); writeFileSync(path,bytes); const mime=object.metadata?.mimetype||object.metadata?.contentType||"application/octet-stream"; wrangler(["r2","object","put",`${r2Bucket}/${targetKey}`,"--file",path,"--content-type",mime,"--remote"]); const digest=sha256(bytes); await upsert("phase4_storage_objects",{source_bucket:object.bucket,source_name:object.name,source_object_id:object.id||null,owner_user_id:object.owner_id||object.owner||null,r2_bucket:r2Bucket,r2_key:targetKey,size_bytes:bytes.length,content_type:mime,source_etag:object.metadata?.eTag||object.metadata?.etag||null,sha256:digest,migrated_at:new Date().toISOString(),status:"copied"},["source_bucket","source_name"]); report.storage.copied++;
      const verify=wrangler(["r2","object","get",`${r2Bucket}/${targetKey}`,"--pipe","--remote"],{encoding:null}); if(sha256(verify)!==digest) throw new Error("R2 checksum mismatch"); await d1("UPDATE phase4_storage_objects SET status='verified' WHERE source_bucket=?1 AND source_name=?2",[object.bucket,object.name]); report.storage.verified++;
    }catch(error){ report.storage.failed++; report.failures.push({table:"storage.objects",rowKey:`${object.bucket}/${object.name}`,error:error instanceof Error?error.message:String(error)}); }
  }}finally{rmSync(temp,{recursive:true,force:true});}
}
async function representativeReconciliation(users){
  const chosen=[...users].sort((a,b)=>sha256(a.id).localeCompare(sha256(b.id))).slice(0,Math.min(3,users.length));
  for(const user of chosen){ const userHash=sha256(user.id); const result={userHash,tables:[],equivalent:true};
    for(const table of REPRESENTATIVE_USER_TABLES){ const spec=PHASE4_TABLES.find((item)=>item.source===table); if(!spec) continue; const source=await fetchPublicTable(table,spec.pk); if(source===null) continue; const owner=source.length?(["user_id","owner_user_id","reporter_user_id"].find((column)=>Object.hasOwn(source[0],column))):null; if(!owner) continue; const sourceRows=source.filter((row)=>row[owner]===user.id).map(normalizeRow); const info=await tableInfo(table); const targetColumns=info.map((row)=>row.name); const comparable=sourceRows.length?Object.keys(sourceRows[0]).filter((column)=>targetColumns.includes(column)):spec.pk; const list=comparable.map(quoteIdentifier).join(","); const targetRowsForUser=await d1(`SELECT ${list} FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(owner)}=?1 ORDER BY ${spec.pk.map(quoteIdentifier).join(",")}`,[user.id]); const sourceHash=hashRows(sourceRows,spec.pk),targetHash=hashRows(targetRowsForUser,spec.pk); const equivalent=sourceHash===targetHash; result.tables.push({table,sourceCount:sourceRows.length,targetCount:targetRowsForUser.length,sourceHash,targetHash,equivalent}); if(!equivalent) result.equivalent=false; }
    report.representativeUsers.push(result); if(!result.equivalent) report.discrepancies.push({kind:"representative_user",userHash});
  }
}
async function rollback(){
  databaseId=await ensureD1(); const mappings=await d1("SELECT r2_bucket,r2_key FROM phase4_storage_objects WHERE status IN ('copied','verified')").catch(()=>[]); for(const object of mappings){ try{wrangler(["r2","object","delete",`${object.r2_bucket}/${object.r2_key}`,"--remote"]);}catch{} }
  await cf(`/d1/database/${databaseId}`,{method:"DELETE"}); report.rollback={databaseDeleted:true,phase4R2ObjectsDeleted:mappings.length,sourceTouched:false};
}
async function main(){
  databaseId=await ensureD1(); report.databaseId=databaseId;
  if(mode==="rollback"){await rollback(); report.completedAt=new Date().toISOString(); writeFileSync("phase4-report.json",JSON.stringify(report,null,2)); return;}
  await applySchema();
  const existingRun=(await d1("SELECT * FROM phase4_migration_runs WHERE run_id=?1",[runId]))[0]; if(!existingRun) await upsert("phase4_migration_runs",{run_id:runId,source_project:new URL(supabaseUrl).hostname,target_database_id:databaseId,status:"running",source_fingerprint:null,target_fingerprint:null,started_at:new Date().toISOString(),completed_at:null,failure_count:0,notes:"{}"},["run_id"]);
  const users=await migrateIdentity(); if(mode!=="reconcile") for(const spec of PHASE4_TABLES) await migrateTable(spec); else for(const spec of PHASE4_TABLES) await migrateTable(spec);
  await migrateStorage(); await representativeReconciliation(users);
  const fk=await d1("PRAGMA foreign_key_check;"); if(fk.length) report.discrepancies.push({kind:"foreign_key_check",count:fk.length,examples:fk.slice(0,10)});
  const sourceFingerprint=sha256(report.tables.map(({table,sourceCount,sourceHash,status})=>({table,sourceCount,sourceHash,status}))); const targetFingerprint=sha256(report.tables.map(({table,targetCount,targetHash,status})=>({table,targetCount,targetHash,status})));
  report.sourceFingerprint=sourceFingerprint; report.targetFingerprint=targetFingerprint; report.foreignKeyViolations=fk.length; report.completedAt=new Date().toISOString(); report.status=report.failures.length||report.discrepancies.length||report.storage.failed?"failed":"reconciled";
  await d1("UPDATE phase4_migration_runs SET status=?2,source_fingerprint=?3,target_fingerprint=?4,completed_at=?5,failure_count=?6,notes=?7 WHERE run_id=?1",[runId,report.status,sourceFingerprint,targetFingerprint,report.completedAt,report.failures.length,JSON.stringify({discrepancies:report.discrepancies.length,storage:report.storage})]);
  writeFileSync("phase4-report.json",JSON.stringify(report,null,2)); if(report.status!=="reconciled") throw new Error(`Phase 4 reconciliation failed: ${report.failures.length} row/storage failures, ${report.discrepancies.length} discrepancies`);
}
main().catch((error)=>{report.status="failed";report.completedAt=new Date().toISOString();report.fatal=error instanceof Error?error.stack||error.message:String(error);writeFileSync("phase4-report.json",JSON.stringify(report,null,2));console.error(report.fatal);process.exitCode=1;});
