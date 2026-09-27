import { execute, query, transaction } from "./database";
import { notifyLocalAccountChanged } from "./repository";

export type LocalTestAttempt = {
  localId: string; serverId: string | null; chapterId: string; stage: "test_1" | "test_2";
  marksScored: number; marksTotal: number; durationMinutes: number; completedOn: string;
  attemptNumber: number | null; state: "pending" | "synced"; lastError: string | null;
};
type TestInput = Pick<LocalTestAttempt,"chapterId"|"stage"|"marksScored"|"marksTotal"|"durationMinutes"|"completedOn">;
type Row = {local_id:string;server_id:string|null;chapter_id:string;stage:"test_1"|"test_2";marks_scored:number;marks_total:number;duration_minutes:number;completed_on:string;attempt_number:number|null;state:"pending"|"synced";last_error:string|null;idempotency_key:string};
const mapRow=(row:Row):LocalTestAttempt=>({localId:row.local_id,serverId:row.server_id,chapterId:row.chapter_id,stage:row.stage,marksScored:row.marks_scored,marksTotal:row.marks_total,durationMinutes:row.duration_minutes,completedOn:row.completed_on,attemptNumber:row.attempt_number,state:row.state,lastError:row.last_error});

export async function readLocalTestAttempts(accountId:string,contextKey:string):Promise<LocalTestAttempt[]>{
  return (await query<Row>("SELECT * FROM local_test_attempts WHERE account_id=? AND academic_context_key=? ORDER BY completed_on DESC,created_at DESC",[accountId,contextKey])).map(mapRow);
}

export async function recordLocalTestAttempt(accountId:string,contextKey:string,input:TestInput):Promise<string>{
  if(!contextKey||!input.chapterId||!["test_1","test_2"].includes(input.stage)||!Number.isFinite(input.marksScored)||!Number.isFinite(input.marksTotal)||input.marksTotal<=0||input.marksScored<0||input.marksScored>input.marksTotal||!Number.isInteger(input.durationMinutes)||input.durationMinutes<1||input.durationMinutes>1440||!/^\d{4}-\d{2}-\d{2}$/.test(input.completedOn)||input.completedOn>new Date().toISOString().slice(0,10))throw new Error("Check chapter, marks, duration and completed date.");
  const chapter=await query<{server_id:string}>("SELECT server_id FROM academic_catalog WHERE account_id=? AND academic_context_key=? AND entity_type='chapter' AND server_id=? AND deleted_at IS NULL LIMIT 1",[accountId,contextKey,input.chapterId]);
  if(!chapter.length)throw new Error("This chapter is not saved in the selected academic context.");
  const id=crypto.randomUUID(),at=new Date().toISOString();
  await transaction([{sql:"INSERT INTO local_test_attempts(local_id,account_id,academic_context_key,chapter_id,stage,marks_scored,marks_total,duration_minutes,completed_on,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",args:[id,accountId,contextKey,input.chapterId,input.stage,input.marksScored,input.marksTotal,input.durationMinutes,input.completedOn,id,at,at]}]);
  notifyLocalAccountChanged(accountId);
  return id;
}

// Keep the same idempotency key on every retry, including after a process restart.
// A failed attempt stays on disk; the server remains authoritative for milestones.
const running=new Map<string,Promise<number>>();
export function flushLocalTestAttempts(accountId:string,contextKey:string,send:(body:Record<string,unknown>)=>Promise<{attempt?:{id:string;attemptNumber?:number}}>):Promise<number>{
  const key=`${accountId}:${contextKey}`,existing=running.get(key);
  if(existing)return existing;
  const task=flushPending(accountId,contextKey,send).finally(()=>running.delete(key));running.set(key,task);return task;
}
async function flushPending(accountId:string,contextKey:string,send:(body:Record<string,unknown>)=>Promise<{attempt?:{id:string;attemptNumber?:number}}>):Promise<number>{
  const rows=await query<Row>("SELECT * FROM local_test_attempts WHERE account_id=? AND academic_context_key=? AND state='pending' ORDER BY created_at LIMIT 30",[accountId,contextKey]);
  let sent=0;
  for(const row of rows){
    let result:{attempt?:{id:string;attemptNumber?:number}};
    try{result=await send({chapterId:row.chapter_id,stage:row.stage,marksScored:row.marks_scored,marksTotal:row.marks_total,durationMinutes:row.duration_minutes,completedOn:row.completed_on,idempotencyKey:row.idempotency_key});}
    catch(error){await execute("UPDATE local_test_attempts SET last_error=?,updated_at=? WHERE account_id=? AND local_id=? AND state='pending'",[error instanceof Error?error.message:"Upload paused",new Date().toISOString(),accountId,row.local_id]);notifyLocalAccountChanged(accountId);throw error;}
    if(!result?.attempt?.id)throw new Error("Test confirmation was incomplete; the saved attempt will retry.");
    await execute("UPDATE local_test_attempts SET state='synced',server_id=?,attempt_number=?,last_error=NULL,updated_at=? WHERE account_id=? AND local_id=? AND state='pending'",[result.attempt.id,result.attempt.attemptNumber??null,new Date().toISOString(),accountId,row.local_id]);
    notifyLocalAccountChanged(accountId);sent++;
  }
  return sent;
}
