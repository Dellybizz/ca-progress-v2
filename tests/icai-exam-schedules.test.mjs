import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { parseExamSchedule, scheduleAttemptKeys } from '../lib/icai/exam-schedule.ts';

const require = createRequire(import.meta.url);
const modules = new Map();
function load(path) {
  path = resolve(path); if (modules.has(path)) return modules.get(path);
  const loaded = { exports: {} }; modules.set(path, loaded.exports);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require','module','exports',code)(name => name.startsWith('.') ? load(resolve(dirname(path), `${name}.ts`)) : require(name), loaded, loaded.exports);
  return loaded.exports;
}
const { resolveExamSchedules, extractSchedulePdf } = load('workers/icai-sync/exam-schedule-resolver.ts');
const subjects = ['foundation','intermediate','final'].flatMap(levelCode => Array.from({ length: levelCode === 'foundation' ? 4 : 6 }, (_,i)=>({id:`${levelCode}-${i+1}`,title:`Subject ${i+1}`,paperLabel:`Paper ${i+1}`,levelCode})));
// Synthetic fixture dates, never seed/production data.
const timetable = `INTERMEDIATE COURSE EXAMINATION
Group-I: 4th, 6th & 8th January 2027
Group-II: 10th, 12th, & 14th January 2027
FOUNDATION COURSE EXAMINATION
5th, 7th, 9th & 11th January 2027
FINAL COURSE EXAMINATION
Group-I: 2nd, 4th & 6th May 2027
Group-II: 8th, 10th & 12th May 2027`;
const evidence = 'https://resource.cdn.icai.org/synthetic.pdf';
function makePdf(text) {
  const stream = `BT /F1 10 Tf 20 750 Td 14 TL ${text.split('\n').map(line=>`(${line.replace(/[()\\]/g,'\\$&')}) Tj T*`).join('\n')} ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let pdf='%PDF-1.4\n'; const offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const start=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf));
}
function database() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE icai_exam_document_cache(url TEXT PRIMARY KEY,etag TEXT,last_modified TEXT,content_hash TEXT,parser_version TEXT,payload TEXT,checked_at TEXT)');
  return {sqlite,prepare(sql){const statement=sqlite.prepare(sql);return {bind(...args){return {async first(){return statement.get(...args)??null;},async run(){statement.run(...args);return {success:true};}};}};}};
}
const source={id:'icai-live-exam-schedules',name:'Official schedules',officialUrl:'https://www.icai.org/students.shtml?mod=4',sourceType:'exam_schedule_index',timeoutMs:1000,requestIntervalSeconds:0};
const now = new Date('2026-09-11T00:00:00Z');
const root='<a href="https://www.icai.org/post/new-attempt">Examinations - January 2027</a><a href="https://www.icai.org/post/old">Examinations - January 2025</a><a href="https://www.icai.org/post/class">Live classes January 2027 examination</a>';

test('schedule discovery handles shared years without a fixed list of attempts',()=>{
  assert.deepEqual(scheduleAttemptKeys('September & November 2026'),['2026-09','2026-11']);
  assert.deepEqual(scheduleAttemptKeys('January, May and September 2028'),['2028-01','2028-05','2028-09']);
});
test('the retained migration registers one live schedule source without embedding dates',()=>{
  const migration=readFileSync('d1/migrations/0041_icai_live_exam_schedules.sql','utf8');
  assert.match(migration,/icai-live-exam-schedules/);
  assert.match(migration,/exam_schedule_index/);
  assert.doesNotMatch(migration,/2027-01-\d{2}/);
  assert.match(readFileSync('scripts/apply-retained-d1-migrations.mjs','utf8'),/0041_icai_live_exam_schedules/);
  const phase2=readFileSync('scripts/verify-icai-phase2-live.mjs','utf8');
  assert.match(phase2,/"icai-live-exam-schedules"/);
  assert.doesNotMatch(phase2,/all six sources|six-source baseline/);
  const engine=readFileSync('workers/icai-sync/sync-engine.ts','utf8');
  assert.match(engine,/right\.sourceType === "exam_schedule_index"/);
  assert.match(readFileSync('workers/icai-sync/exam-schedule-resolver.ts','utf8'),/if \(Date\.now\(\) > deadline\) break/);
});
test('all levels and both groups map each paper to its actual date',()=>{
  const parsed=parseExamSchedule(timetable,evidence,subjects); assert.equal(parsed.events.length,16);
  assert.equal(parsed.events.find(event=>event.subjectId==='intermediate-4').eventDate,'2027-01-10');
  assert.equal(parsed.events.find(event=>event.subjectId==='final-1').attemptKey,'2027-05');
  assert.ok(parsed.events.every(event=>event.sourceUrl===evidence));
  assert.ok(parsed.attempts.every(attempt=>attempt.startDate===null));
});
test('classes, forms and publication dates never become countdowns',()=>{
  for(const text of ['Foundation January 2027 live classes scheduled on 2 September 2026','Online exam forms September 2026 Start Date 06-July-2026','Announcement published (02-05-2026)']) assert.equal(parseExamSchedule(text,evidence,subjects).events.length,0);
});
test('invalid, incomplete, conflicting and ambiguous subject mappings fail closed',()=>{
  assert.throws(()=>parseExamSchedule(timetable.replace('4th, 6th & 8th January','32nd, 6th & 8th January'),evidence,subjects),/Invalid date/);
  assert.throws(()=>parseExamSchedule('INTERMEDIATE COURSE EXAMINATION Group-I: 4th,6th & 8th January 2027',evidence,subjects),/Incomplete/);
  assert.throws(()=>parseExamSchedule(timetable,evidence,[...subjects,subjects[4]]),/uniquely map/);
});
test('real PDF extraction feeds the schedule parser',async()=>{
  const text=await extractSchedulePdf(makePdf(timetable)); assert.equal(parseExamSchedule(text,evidence,subjects).events.length,16);
});
test('new attempt discovery reaches PDFs; a 304 recheck retains identical events and resources',async()=>{
  const db=database(); const calls=[]; let repeat=false;
  const fetcher=async(url,options)=>{
    calls.push(url);
    if(url.includes('examination_announcement')) return new Response('<html></html>',{headers:{'content-type':'text/html'}});
    if(url.endsWith('/new-attempt'))return new Response(`<a href="${evidence}">Important Announcement</a>`,{headers:{'content-type':'text/html'}});
    if(url===evidence){if(repeat){assert.equal(options.headers.get('If-None-Match'),'v1');return new Response(null,{status:304});}return new Response(makePdf(timetable),{headers:{'content-type':'application/pdf',etag:'v1'}});}
    throw new Error(`Unexpected fetch: ${url}`);
  };
  try {
    const first=await resolveExamSchedules(root,source,subjects,db,'test',async()=>{},new Set(),fetcher,now);
    repeat=true;const second=await resolveExamSchedules(root,source,subjects,db,'test',async()=>{},new Set(),fetcher,now);
    assert.deepEqual(second,first);assert.equal(first.events.length,16);assert.equal(first.resources.length,1);
    assert.ok(!calls.some(url=>/\/old|\/class/.test(url)));
  }finally{db.sqlite.close();}
});
test('failed PDFs and redirects outside ICAI prevent source success',async()=>{
  for(const redirect of [false,true]) {
    const db=database();const fetcher=async(url)=>{
      if(url.includes('examination_announcement'))return new Response('',{headers:{'content-type':'text/html'}});
      if(url.endsWith('/new-attempt'))return new Response(`<a href="${evidence}">Important Announcement</a>`,{headers:{'content-type':'text/html'}});
      if(url===evidence)return redirect?new Response(null,{status:302,headers:{location:'https://example.com/evil.pdf'}}):new Response('',{status:503});
      throw new Error('Unexpected external fetch');
    };
    try{await assert.rejects(resolveExamSchedules(root,source,subjects,db,'test',async()=>{},new Set(),fetcher,now),redirect?/non-HTTPS or non-ICAI/:/503/);}finally{db.sqlite.close();}
  }
});
test('an inconsistent guidance fallback is ignored without inventing a corrected date',async()=>{
  const db=database();
  const malformed=timetable.replace('6th May 2027','6th May 2026');
  const fetcher=async(url)=>{
    if(url.includes('examination_announcement'))return new Response('',{headers:{'content-type':'text/html'}});
    if(url.endsWith('/new-attempt'))return new Response(`<a href="${evidence}">Guidance Notes for Final Exams May 2027</a>`,{headers:{'content-type':'text/html'}});
    if(url===evidence)return new Response(makePdf(malformed),{headers:{'content-type':'application/pdf'}});
    throw new Error(`Unexpected fetch: ${url}`);
  };
  try{
    const parsed=await resolveExamSchedules(root,source,subjects,db,'test',async()=>{},new Set(),fetcher,now);
    assert.equal(parsed.events.length,0);
    assert.equal(parsed.attempts.length,0);
  }finally{db.sqlite.close();}
});
test('a changed PDF is reparsed instead of reusing stale dates',async()=>{
  const db=database();let version=1;
  const fetcher=async(url)=>url.includes('examination_announcement')?new Response('',{headers:{'content-type':'text/html'}}):url.endsWith('/new-attempt')?new Response(`<a href="${evidence}">Important Announcement</a>`,{headers:{'content-type':'text/html'}}):new Response(makePdf(version===1?timetable:timetable.replace('14th January','16th January')),{headers:{'content-type':'application/pdf',etag:`v${version}`}});
  try{await resolveExamSchedules(root,source,subjects,db,'test',async()=>{},new Set(),fetcher,now);version=2;const changed=await resolveExamSchedules(root,source,subjects,db,'test',async()=>{},new Set(),fetcher,now);assert.equal(changed.events.find(event=>event.subjectId==='intermediate-6').eventDate,'2027-01-16');}finally{db.sqlite.close();}
});

test('D1 auto-publishes new mapped dates; changed dates queue one review and preserve the approved event',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('d1/migrations/0001_phase2_platform.sql','utf8'));
  sqlite.exec('ALTER TABLE icai_sources ADD COLUMN last_listing_hash TEXT;');
  sqlite.exec(readFileSync('d1/migrations/0041_icai_live_exam_schedules.sql','utf8'));
  sqlite.exec("INSERT INTO course_levels(id,code,name) VALUES('inter','intermediate','Intermediate'); INSERT INTO course_groups(id,level_id,code,name) VALUES('g1','inter','group_1','Group 1');");
  sqlite.prepare('INSERT INTO subjects(id,level_id,group_id,code,paper_label,slug,title,subject_kind,source_url) VALUES(?,?,?,?,?,?,?,?,?)').run('subject','inter','g1','p1','Paper 1','p1','Advanced Accounting','paper',evidence);
  sqlite.prepare('INSERT INTO icai_sync_runs(id,trigger_type,parser_version,status,started_at,source_total) VALUES(?,?,?,?,?,?)').run('run','manual','phase8.1','running',new Date().toISOString(),1);
  const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values);},async first(){return sqlite.prepare(sql).get(...args)??null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){sqlite.prepare(sql).run(...args);return {success:true};}});
  const db={prepare:sql=>wrap(sql),batch:async statements=>Promise.all(statements.map(statement=>statement.run()))};
  const {IcaiD1Client}=load('workers/icai-sync/d1-client.ts');const client=new IcaiD1Client(db);
  const attempt={id:'attempt-intermediate-2027-01',level_id:'inter',attempt_key:'2027-01',label:'January 2027',status:'scheduled',source_url:evidence,content_hash:'attempt',confidence:0.98};
  const event={id:'stable-paper-id',attempt_id:attempt.id,subject_id:'subject',event_type:'exam_paper',title:'Paper 1',event_date:'2027-01-04',source_url:evidence,content_hash:'v1',confidence:0.98};
  const args={p_run_id:'run',p_source_id:'icai-live-exam-schedules',p_snapshot:{http_status:200,canonical_hash:'first',parser_version:'phase8.1'},p_attempts:[attempt],p_events:[event],p_resources:[]};
  try{
    assert.equal((await client.rpc('icai_sync_apply_source_batch',args)).error,null);
    assert.equal(sqlite.prepare('SELECT verification_status FROM exam_events').get().verification_status,'verified');
    const {dashboardExamQuery}=load('lib/dashboard/exam-query.ts');const query=dashboardExamQuery(attempt.id,['subject'],'2027-01-01');
    assert.equal(sqlite.prepare(query.sql).get(...query.values).event_date,'2027-01-04');
    const changed={...args,p_events:[{...event,event_date:'2027-01-06',content_hash:'v2'}]};
    assert.equal((await client.rpc('icai_sync_apply_source_batch',changed)).error,null);
    assert.equal((await client.rpc('icai_sync_apply_source_batch',changed)).error,null);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM exam_events').get().count,1);
    assert.equal(sqlite.prepare('SELECT event_date FROM exam_events').get().event_date,'2027-01-04');
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM icai_review_queue WHERE status='pending'").get().count,1);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{sqlite.close();}
});

test('the actual continuation job persists extracted events despite an empty partial-events checkpoint',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  for(const file of readdirSync('d1/migrations').filter(name=>name.endsWith('.sql')).sort()) sqlite.exec(readFileSync(`d1/migrations/${file}`,'utf8'));
  const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values);},async first(){return sqlite.prepare(sql).get(...args)??null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){sqlite.prepare(sql).run(...args);return {success:true};}});
  const db={prepare:sql=>wrap(sql),batch:async statements=>Promise.all(statements.map(statement=>statement.run()))};
  for(const level of ['foundation','intermediate','final']){
    sqlite.prepare('INSERT INTO course_levels(id,code,name) VALUES(?,?,?)').run(level,level,level);
    sqlite.prepare('INSERT INTO course_groups(id,level_id,code,name) VALUES(?,?,?,?)').run(`${level}-g`,level,'group_1','Group 1');
  }
  for(const subject of subjects)sqlite.prepare('INSERT INTO subjects(id,level_id,group_id,code,paper_label,slug,title,subject_kind,source_url) VALUES(?,?,?,?,?,?,?,?,?)').run(subject.id,subject.levelCode,`${subject.levelCode}-g`,subject.id,subject.paperLabel,subject.id,subject.title,'paper',evidence);
  sqlite.exec("UPDATE icai_sources SET request_interval_seconds=0 WHERE id='icai-live-exam-schedules';");
  const begin=(id)=>{
    sqlite.prepare('INSERT INTO icai_sync_runs(id,trigger_type,parser_version,status,started_at,source_total) VALUES(?,?,?,?,?,?)').run(id,'manual','phase8.1','running',new Date().toISOString(),1);
    sqlite.prepare('INSERT INTO icai_sync_source_states(run_id,source_id,source_index) VALUES(?,?,?)').run(id,'icai-live-exam-schedules',0);
  };
  let changed=false;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>String(url).includes('students.shtml')?new Response(root,{headers:{'content-type':'text/html'}}):String(url).includes('examination_announcement')?new Response('',{headers:{'content-type':'text/html'}}):String(url).endsWith('/new-attempt')?new Response(`<a href="${evidence}">Important Announcement</a>`,{headers:{'content-type':'text/html'}}):new Response(makePdf(changed?timetable.replace('14th January','16th January'):timetable),{headers:{'content-type':'application/pdf'}});
  try{
    const {runIcaiSyncContinuationSource}=load('workers/icai-sync/sync-engine.ts');
    begin('source-first');
    const result=await runIcaiSyncContinuationSource({db,enabled:true,userAgent:'test'},{runId:'source-first',sourceId:'icai-live-exam-schedules'});
    assert.equal(result.status,'succeeded');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM exam_events').get().count,16);
    changed=true;begin('source-changed');
    await runIcaiSyncContinuationSource({db,enabled:true,userAgent:'test'},{runId:'source-changed',sourceId:'icai-live-exam-schedules'});
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM exam_events').get().count,16);
    assert.equal(sqlite.prepare("SELECT event_date FROM exam_events WHERE subject_id='intermediate-6'").get().event_date,'2027-01-14');
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM icai_review_queue WHERE entity_type='exam_event' AND status='pending'").get().count,1);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{globalThis.fetch=originalFetch;sqlite.close();}
});
