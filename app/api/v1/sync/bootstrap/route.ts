import { NextResponse, type NextRequest } from "next/server";
import { getStudentContext } from "@/lib/academic/student-context";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";

export const dynamic = "force-dynamic";
const json = (request: NextRequest, data: unknown, status=200) => NextResponse.json(data,{status,headers:{...MOBILE_API_HEADERS,...nativeCorsHeaders(request)}});
export const OPTIONS = (request: NextRequest) => nativeOptions(request);

export async function GET(request: NextRequest) {
  const context=await getStudentContext();
  if(context.mode!=="ready"||!context.userId)return json(request,{error:{code:"AUTH_REQUIRED",message:"Sign in to synchronize.",retryable:false}},401);
  const requested=request.nextUrl.searchParams.get("context");
  if(requested&&requested!==context.contextKey)return json(request,{error:{code:"CONTEXT_CHANGED",message:"Academic context changed.",retryable:false}},409);
  const db=getD1RuntimeDatabase();
  const [progress,tasks,notes,sessions,tracked]=await Promise.all([
    db.prepare(`SELECT 'progress' AS entity_type,chapter_id AS entity_id,0 AS entity_version,
      json_object('chapterId',chapter_id,'completedAt',completed_at,'revision1At',revision_1_at,'revision2At',revision_2_at,'test1At',test_1_at,'test2At',test_2_at) AS payload_json,
      NULL AS deleted_at,updated_at FROM chapter_progress WHERE user_id=?1 ORDER BY updated_at LIMIT 1500`).bind(context.userId).all(),
    db.prepare(`SELECT 'planner_task' AS entity_type,id AS entity_id,0 AS entity_version,
      json_object('id',id,'title',title,'notes',notes,'subjectId',subject_id,'chapterId',chapter_id,'dueAt',due_at,'estimatedMinutes',estimated_minutes,'status',status,'completedAt',completed_at) AS payload_json,
      NULL AS deleted_at,updated_at FROM tasks WHERE user_id=?1 ORDER BY updated_at LIMIT 1500`).bind(context.userId).all(),
    db.prepare(`SELECT 'note' AS entity_type,id AS entity_id,0 AS entity_version,
      json_object('id',id,'title',title,'body',body_text,'bodyHtml',body_html,'subjectId',subject_id,'chapterId',chapter_id,'visibility',visibility) AS payload_json,
      NULL AS deleted_at,updated_at FROM notes WHERE user_id=?1 ORDER BY updated_at LIMIT 1000`).bind(context.userId).all(),
    db.prepare(`SELECT 'focus_session' AS entity_type,id AS entity_id,0 AS entity_version,
      json_object('id',id,'subjectId',subject_id,'chapterId',chapter_id,'mode',mode,'startedAt',started_at,'endedAt',ended_at,'durationSeconds',duration_seconds) AS payload_json,
      NULL AS deleted_at,created_at AS updated_at FROM study_sessions WHERE user_id=?1 ORDER BY created_at DESC LIMIT 1000`).bind(context.userId).all(),
    db.prepare(`SELECT entity_type,entity_id,entity_version,payload_json,deleted_at,updated_at
      FROM mobile_sync_entities WHERE user_id=?1 AND academic_context_key=?2 ORDER BY entity_type,updated_at,entity_id LIMIT 5000`).bind(context.userId,context.contextKey).all(),
  ]);
  const snapshot=[...(progress.results??[]),...(tasks.results??[]),...(notes.results??[]),...(sessions.results??[])];
  const merged=new Map(snapshot.map(entity=>[`${String(entity.entity_type)}:${String(entity.entity_id)}`,entity]));
  for(const entity of tracked.results??[])merged.set(`${String(entity.entity_type)}:${String(entity.entity_id)}`,entity);
  const entities=[...merged.values()];
  const high=(await db.prepare("SELECT COALESCE(MAX(sequence),0) AS cursor FROM mobile_sync_changes WHERE user_id=?1 AND academic_context_key=?2")
    .bind(context.userId,context.contextKey).first<{cursor:number}>())?.cursor??0;
  return json(request,{schema:1,accountId:context.userId,academicContextKey:context.contextKey,cursor:String(high),entities});
}
