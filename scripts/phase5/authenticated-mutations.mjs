import { mkdir, writeFile } from "node:fs/promises";
const base=process.env.SMOKE_BASE_URL||"https://ca-progress-v2.habeebaasif622.workers.dev";
const cookie=process.env.SMOKE_AUTH_COOKIE||"";
const moderatorCookie=process.env.SMOKE_MODERATOR_AUTH_COOKIE||cookie;
if(!cookie) throw new Error("SMOKE_MUTATION_AUTH_COOKIE is required");
const results=[];
async function call(label,path,body,auth=cookie,method="POST"){
  const r=await fetch(base+path,{method,headers:{cookie,"content-type":"application/json","x-ca-phase1-test":"true"},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data=text.slice(0,500)}
  results.push({label,status:r.status,ok:r.ok,data});
  return {r,data};
}
await call("authenticated viewer","/api/auth/viewer",undefined,cookie,"GET");
const stamp="phase1-"+Date.now();
const note=await call("note create","/api/notes",{title:stamp,bodyHtml:"<p>Phase 1 isolated test</p>",visibility:"private"});
if(note.r.ok&&note.data?.id){
 const id=note.data.id;
 await call("note update","/api/notes",{id,title:stamp+" updated",bodyHtml:"<p>updated</p>",visibility:"private"});
 await call("note delete","/api/notes/"+id,undefined,cookie,"DELETE");
}
const task=await call("task create","/api/planner/tasks",{action:"create",title:stamp,taskKind:"other",dueAt:new Date(Date.now()+86400000).toISOString(),estimatedMinutes:15});
if(task.r.ok&&task.data?.id){const id=task.data.id;await call("task update","/api/planner/tasks",{action:"update",id,title:stamp+" updated",taskKind:"other",dueAt:new Date(Date.now()+86400000).toISOString(),estimatedMinutes:20});await call("task toggle","/api/planner/tasks",{action:"toggle",id,done:true});await call("task delete","/api/planner/tasks",{action:"delete",id});}
const goal=await call("goal create","/api/planner/goals",{action:"create",title:stamp,dueDate:new Date(Date.now()+86400000).toISOString().slice(0,10)});
if(goal.r.ok&&goal.data?.id){const id=goal.data.id;await call("goal toggle","/api/planner/goals",{action:"toggle",id,done:true});await call("goal delete","/api/planner/goals",{action:"delete",id});}
const event=await call("calendar create","/api/planner/calendar",{action:"create",title:stamp,startsAt:new Date(Date.now()+86400000).toISOString(),allDay:false});
if(event.r.ok&&event.data?.id){const id=event.data.id;await call("calendar update","/api/planner/calendar",{action:"update",id,title:stamp+" updated",startsAt:new Date(Date.now()+86400000).toISOString(),allDay:false});await call("calendar delete","/api/planner/calendar",{action:"delete",id});}
const chapter=process.env.SMOKE_TEST_CHAPTER_ID;
if(chapter){for(const stage of ["completed","revision_1","revision_2","test_1","test_2"])await call("progress "+stage,"/api/progress",{action:"set_stage",chapterId:chapter,stage,enabled:true});}
await mkdir("phase1-report",{recursive:true});await writeFile("phase1-report/authenticated-mutations.json",JSON.stringify({base,generatedAt:new Date().toISOString(),results},null,2));
const failures=results.filter(x=>x.status>=500);if(failures.length)throw new Error(`${failures.length} authenticated checks returned 5xx`);
console.log(`Phase 1 harness completed ${results.length} checks; report written to phase1-report/authenticated-mutations.json`);