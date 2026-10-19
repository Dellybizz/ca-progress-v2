import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {readFileSync,readdirSync} from 'node:fs';
import {tmpdir,cpus} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
const output=process.argv[2]||'deployment-evidence/file-manager-phase0/workspace-baseline.json';
const temp=await mkdtemp(join(tmpdir(),'ca-workspace-baseline-'));
let workspace;
try{
 const result=await build({stdin:{contents:"export {listWorkspace} from '@/lib/resources/workspace';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'local-only',setup(b){b.onResolve({filter:/^(server-only|@\/lib\/resources\/r2|@\/lib\/data\/d1\/runtime)$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const RESOURCE_R2_STORAGE_BUCKET="fixture";export const getResourceR2Bucket=()=>{throw Error("No remote storage in baseline")};export const getHotD1Database=()=>{throw Error("No remote database in baseline")};'}));}}]});
 const file=join(temp,'workspace.mjs');await writeFile(file,result.outputFiles[0].text);workspace=await import('file://'+file);
}finally{await rm(temp,{recursive:true,force:true});}
const profiles=[];
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
for(const count of [0,24,1000,10000,100000]){
 const sqlite=new DatabaseSync(':memory:');const measurements=[];let calls=[];
 try{
  for(const name of readdirSync('d1/migrations').filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync('d1/migrations/'+name,'utf8'));
  sqlite.exec("INSERT INTO app_users(user_id,auth_provider) VALUES('alice','local-test'),('bob','local-test')");
  const note=sqlite.prepare("INSERT INTO notes(id,user_id,owner_label,title,body_html,body_text,visibility,moderation_status)VALUES(?,'alice','Fixture',?,'<p>Fixture</p>',?,'private','private')");
  const upload=sqlite.prepare("INSERT INTO uploaded_resources(id,owner_user_id,owner_label,title,original_filename,safe_filename,storage_bucket,storage_path,mime_type,extension,size_bytes,visibility,moderation_status)VALUES(?,'alice','Fixture',?,'fixture.pdf','fixture.pdf','fixture',?,'application/pdf','pdf',1024,'private','private')");
  sqlite.exec('BEGIN');for(let i=0;i<count;i++){const id=String(i).padStart(6,'0');if(i%2===0)upload.run('u'+id,'File '+id,'fixture/'+id);else note.run('n'+id,'Note '+id,i===count-1?'x'.repeat(220)+'baseline-tail-needle':'Accounting revision');}sqlite.exec('COMMIT');
  const folderCount=count>=10000?1000:0;
  const insertFolder=sqlite.prepare("INSERT INTO resource_folders(id,owner_user_id,parent_id,name)VALUES(?,'alice',?,?)");
  for(let i=0;i<folderCount;i++)insertFolder.run('folder-'+i,i>0&&i<32?'folder-'+(i-1):null,'Folder '+i);
  sqlite.exec("INSERT INTO notes(id,user_id,owner_label,title,body_html,body_text,visibility,moderation_status)VALUES('private-bob','bob','Bob','Hidden','<p>private</p>','private-owner-sentinel','private','private')");
  function prepare(sql,values=[]){return {bind(...args){return prepare(sql,args);},async first(){const start=performance.now();const row=sqlite.prepare(sql).get(...values)??null;calls.push({sql,values,ms:performance.now()-start,rows:row?1:0});return row;},async all(){const start=performance.now();const results=sqlite.prepare(sql).all(...values);calls.push({sql,values,ms:performance.now()-start,rows:results.length});return {results};}};}
  const db={prepare};
  const scenarios=[['first-page',{sort:'name',direction:'asc',limit:96}],['full-text-tail',{query:'baseline-tail-needle',limit:24}],...(folderCount?[['nested-folder',{view:'folder',folder:'folder-31',limit:24}]]:[])];
  for(const [name,query]of scenarios){
   await workspace.listWorkspace('alice',[],query,db);const samples=[];let page,lastCalls;
   for(let n=0;n<9;n++){calls=[];const start=performance.now();page=await workspace.listWorkspace('alice',[],query,db);samples.push(performance.now()-start);lastCalls=calls;}
   if(name==='first-page')assert.equal(page.total,count);
   if(name==='full-text-tail')assert.equal(page.total,count?1:0);
   const plans=lastCalls.map(call=>({statement:call.sql.includes('count(*) total')?'count':call.sql.includes('revision')?'revision':call.sql.includes('resource_folders f')?'folders':'page',rows_returned:call.rows,plan:sqlite.prepare('EXPLAIN QUERY PLAN '+call.sql).all(...call.values).map(row=>row.detail)}));
   measurements.push({scenario:name,samples:9,median_ms:Number(percentile(samples,.5).toFixed(2)),p95_sample_ms:Number(percentile(samples,.95).toFixed(2)),queries:lastCalls.length,folder_rows:page.folders.length,response_bytes:Buffer.byteLength(JSON.stringify(page)),returned_files:page.files.length,query_plans:plans});
  }
  const hidden=await workspace.listWorkspace('alice',[],{query:'private-owner-sentinel'},db);assert.equal(hidden.total,0);
  let traversal=null;if(count===1000){let cursor,seen=new Set(),pages=0;do{const page=await workspace.listWorkspace('alice',[],{sort:'name',direction:'asc',limit:96,cursor},db);for(const file of page.files){assert.ok(!seen.has(file.key));seen.add(file.key);}cursor=page.nextCursor;pages++;}while(cursor);assert.equal(seen.size,count);traversal={records:seen.size,pages,duplicates:0};}
  assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
  profiles.push({records:count,folders:folderCount,measurements,owner_isolation:true,full_cursor_traversal:traversal,rss_bytes:process.memoryUsage().rss});
  console.log(`PASS actual workspace baseline: ${count} records, ${folderCount} folders`);
 }finally{sqlite.close();}
}
const evidence={generated_at:new Date().toISOString(),source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runtime:process.version,cpu:cpus()[0]?.model,scope:'Actual listWorkspace SQL and all retained migrations on local in-memory SQLite; not a production D1 latency SLO or browser benchmark',profiles};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(evidence,null,2)+'\n');
console.log('PASS baseline evidence saved; no production account/object writes');
