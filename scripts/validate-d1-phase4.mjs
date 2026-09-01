import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const wrangler=process.platform==="win32"?"npx.cmd":"npx";
const base=["wrangler","--config","wrangler.phase4.jsonc"];
const database="ca-progress-v2-phase4-local";
let persistTo=mkdtempSync(join(tmpdir(),"ca-progress-d1-phase4-"));
function run(args){return execFileSync(wrangler,[...base,...args],{cwd:process.cwd(),encoding:"utf8",stdio:["ignore","pipe","pipe"],env:{...process.env,CI:"1",NO_D1_WARNING:"true"}});}
function execute(command){const output=run(["d1","execute",database,"--local","--persist-to",persistTo,"--command",command,"--json"]);return JSON.parse(output)?.[0]?.results??[];}
function apply(){run(["d1","migrations","apply",database,"--local","--persist-to",persistTo]);}
function assert(condition,message){if(!condition)throw new Error(message);}
const q=(value)=>`'${String(value).replaceAll("'","''")}'`;

try{
  apply();
  const objects=execute("SELECT name,type FROM sqlite_master WHERE name IN ('admin_users','feature_flags','phase4_migration_runs','phase4_migration_checkpoints','phase4_migration_failures','phase4_storage_objects','phase4_shadow_comparisons') ORDER BY name;");
  for(const name of ["admin_users","feature_flags","phase4_migration_runs","phase4_migration_checkpoints","phase4_migration_failures","phase4_storage_objects","phase4_shadow_comparisons"]) assert(objects.some((row)=>row.name===name&&row.type==="table"),`Missing Phase 4 table ${name}`);
  const profileColumns=execute("PRAGMA table_info(profiles);").map((row)=>row.name); for(const column of ["primary_use","feature_guide_completed_at","primary_use_priority"]) assert(profileColumns.includes(column),`Missing migrated profile field ${column}`);

  execute("INSERT INTO app_users(user_id,auth_provider,provider_subject,account_state,role) VALUES('phase4-user','supabase-auth','phase4-user','active','student');");
  execute("INSERT INTO course_levels(id,code,name,sort_order,is_active) VALUES('level','L','Level',1,1),('level-2','L2','Level 2',2,1);");
  execute("INSERT INTO course_groups(id,level_id,code,name,sort_order,is_default,is_active) VALUES('group','level','G','Group',1,1,1),('group-2','level-2','G2','Group 2',1,1,1);");
  execute("INSERT INTO subjects(id,level_id,group_id,code,paper_label,slug,title,subject_kind,source_url,sort_order,is_active) VALUES('subject','level','group','S','Paper','subject','Subject','standard','https://example.invalid',1,1),('subject-2','level-2','group-2','S2','Paper 2','subject-2','Subject 2','standard','https://example.invalid',1,1);");
  execute("INSERT INTO syllabus_versions(id,subject_id,version_key,title,effective_from,status,source_label,source_url,source_verified_at,verification_method,content_hash) VALUES('syllabus-old','subject','old','Old syllabus','2025-01-01','historical','ICAI','https://example.invalid','2025-01-01T00:00:00Z','fixture','old-hash'),('syllabus-current','subject','current','Current syllabus','2026-01-01','current','ICAI','https://example.invalid','2026-01-01T00:00:00Z','fixture','current-hash'),('syllabus-2','subject-2','current','Current syllabus 2','2026-01-01','current','ICAI','https://example.invalid','2026-01-01T00:00:00Z','fixture','current-hash-2');");
  execute("UPDATE syllabus_versions SET supersedes_version_id='syllabus-old' WHERE id='syllabus-current';");
  execute("INSERT INTO chapters(id,syllabus_version_id,stable_key,chapter_number,title,slug,chapter_kind,sort_order) VALUES('chapter-old','syllabus-old','stable-old','1','Historical chapter','historical-chapter','chapter',1),('chapter-current','syllabus-current','stable-current','1','Current chapter','current-chapter','chapter',1);");
  execute("INSERT INTO chapter_progress(user_id,chapter_id,completed_at) VALUES('phase4-user','chapter-old','2025-05-01T00:00:00Z');");
  execute("INSERT INTO progress_events(id,user_id,chapter_id,action,stage,previous_state,new_state,created_at) VALUES('event-1','phase4-user','chapter-old','set','completed','{}','{\"completed_at\":\"2025-05-01T00:00:00Z\"}','2025-05-01T00:00:00Z'),('event-2','phase4-user','chapter-old','set','revision_1','{}','{\"revision_1_at\":\"2025-05-02T00:00:00Z\"}','2025-05-02T00:00:00Z');");
  assert(Number(execute("SELECT COUNT(*) AS count FROM syllabus_versions;")[0]?.count)===3,"Historical syllabus versions collapsed");
  assert(execute("SELECT chapter_id FROM chapter_progress WHERE user_id='phase4-user';")[0]?.chapter_id==="chapter-old","Historical progress was rewritten to current syllabus");
  assert(Number(execute("SELECT COUNT(*) AS count FROM progress_events WHERE user_id='phase4-user';")[0]?.count)===2,"Progress event history collapsed");

  // PostgreSQL exam attempts are unique per level + attempt_key. Shared calendar keys across
  // Foundation/Intermediate/Final must coexist without changing source IDs.
  execute("INSERT INTO exam_attempts(id,level_id,attempt_key,label,status,verification_status,verification_method,source_url,content_hash,first_seen_at,last_seen_at,last_changed_at,metadata) VALUES('attempt-level-1','level','2099-05','May 2099','scheduled','verified','phase3_verified_bootstrap','https://example.invalid','attempt-hash-1','2098-01-01T00:00:00Z','2098-01-01T00:00:00Z','2098-01-01T00:00:00Z','{}'),('attempt-level-2','level-2','2099-05','May 2099','scheduled','verified','phase3_verified_bootstrap','https://example.invalid','attempt-hash-2','2098-01-01T00:00:00Z','2098-01-01T00:00:00Z','2098-01-01T00:00:00Z','{}');");
  assert(Number(execute("SELECT COUNT(*) AS count FROM exam_attempts WHERE attempt_key='2099-05';")[0]?.count)===2,"Level-scoped attempt keys were collapsed");
  let duplicateLevelRejected=false;
  try{execute("INSERT INTO exam_attempts(id,level_id,attempt_key,label,status,verification_status,verification_method,source_url,content_hash,first_seen_at,last_seen_at,last_changed_at,metadata) VALUES('attempt-level-1-duplicate','level','2099-05','May 2099 duplicate','scheduled','verified','phase3_verified_bootstrap','https://example.invalid','attempt-hash-3','2098-01-01T00:00:00Z','2098-01-01T00:00:00Z','2098-01-01T00:00:00Z','{}');");}catch{duplicateLevelRejected=true;}
  assert(duplicateLevelRejected,"Same-level duplicate attempt_key was not rejected");
  execute("INSERT INTO attempt_syllabus_map(id,attempt_key,level_id,group_id,subject_id,syllabus_version_id) VALUES(9001,'2099-05','level','group','subject','syllabus-current'),(9002,'2099-05','level-2','group-2','subject-2','syllabus-2');");
  assert(Number(execute("SELECT COUNT(*) AS count FROM attempt_syllabus_map WHERE attempt_key='2099-05';")[0]?.count)===2,"Attempt mappings lost level disambiguation");

  execute("INSERT INTO phase4_migration_runs(run_id,source_project,target_database_id,status) VALUES('resume-fixture','source','local','running');");
  const fixture=[{id:"task-a",title:"A"},{id:"task-b",title:"B"}];
  execute(`INSERT INTO tasks(id,user_id,title,task_kind,due_at,estimated_minutes,status,sort_order) VALUES(${q(fixture[0].id)},'phase4-user',${q(fixture[0].title)},'study','2099-01-01T00:00:00Z',30,'todo',0);`);
  execute("INSERT INTO phase4_migration_checkpoints(run_id,source_table,target_table,next_offset,source_count,migrated_count,failed_count,status) VALUES('resume-fixture','tasks','tasks',1,2,1,0,'running');");
  const resumeOffset=Number(execute("SELECT next_offset FROM phase4_migration_checkpoints WHERE run_id='resume-fixture' AND source_table='tasks';")[0]?.next_offset); assert(resumeOffset===1,"Checkpoint did not persist interruption offset");
  for(let index=resumeOffset;index<fixture.length;index++) execute(`INSERT INTO tasks(id,user_id,title,task_kind,due_at,estimated_minutes,status,sort_order) VALUES(${q(fixture[index].id)},'phase4-user',${q(fixture[index].title)},'study','2099-01-01T00:00:00Z',30,'todo',${index}) ON CONFLICT(id) DO UPDATE SET title=excluded.title;`);
  execute("UPDATE phase4_migration_checkpoints SET next_offset=2,migrated_count=2,status='complete' WHERE run_id='resume-fixture' AND source_table='tasks';");
  assert(Number(execute("SELECT COUNT(*) AS count FROM tasks WHERE id IN ('task-a','task-b');")[0]?.count)===2,"Interrupted migration did not resume idempotently");

  execute("INSERT INTO phase4_migration_failures(run_id,source_table,row_key,row_hash,error_code,error_message) VALUES('resume-fixture','tasks','id=bad','hash','FIXTURE','failure retained');");
  assert(Number(execute("SELECT COUNT(*) AS count FROM phase4_migration_failures WHERE run_id='resume-fixture';")[0]?.count)===1,"Failed-row ledger did not retain explicit outcome");
  assert(execute("PRAGMA foreign_key_check;").length===0,"Phase 4 clean D1 fixture has foreign-key violations");

  // Rollback rehearsal: the target is disposable. Deleting the local target and rebuilding from migrations leaves source fixture state untouched.
  rmSync(persistTo,{recursive:true,force:true}); persistTo=mkdtempSync(join(tmpdir(),"ca-progress-d1-phase4-rollback-")); apply();
  assert(Number(execute("SELECT COUNT(*) AS count FROM app_users;")[0]?.count)===0,"Rollback/rebuild did not return D1 to a clean state");
  assert(fixture.length===2,"Rollback modified the read-only source fixture");
  run(["d1","migrations","apply",database,"--local","--persist-to",persistTo]);
  console.log("Phase 4 D1 validation PASS (clean bootstrap, level-scoped attempts, history preservation, resumable checkpoint, explicit failures, FK integrity, rollback/rebuild). ");
}finally{rmSync(persistTo,{recursive:true,force:true});}
