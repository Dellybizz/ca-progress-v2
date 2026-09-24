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
  if(!context.userId)return json(request,{error:{code:"AUTH_REQUIRED",message:"Sign in to synchronize.",retryable:false}},401);
  if(context.mode!=="ready")return json(request,{error:{code:context.mode==="setup"?"ACADEMIC_SETUP_REQUIRED":"ACADEMIC_CONTEXT_INVALID",message:context.mode==="setup"?"Complete your CA level and attempt setup on the website to synchronize this device.":context.issue||"Review your CA level and attempt on the website before synchronizing.",retryable:false}},409);
  const requested=request.nextUrl.searchParams.get("context");
  if(requested&&requested!==context.contextKey)return json(request,{error:{code:"CONTEXT_CHANGED",message:"Academic context changed.",retryable:false}},409);
  const db=getD1RuntimeDatabase();
  const subjectIds=context.subjectIds;
  const subjectPlaceholders=subjectIds.map((_,index)=>`?${index+1}`).join(",");
  const [progress,tasks,notes,sessions,profile,subjects,chapters,attempt,activity,leaderboard,buddies,tracked]=await Promise.all([
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
    db.prepare(`SELECT 'profile' AS entity_type,user_id AS entity_id,0 AS entity_version,
      json_object('displayName',display_name,'level',ca_level,'attempt',attempt_key,'timezone',timezone,'dailyTargetMinutes',daily_target_minutes) AS payload_json,
      NULL AS deleted_at,updated_at FROM profiles WHERE user_id=?1 LIMIT 1`).bind(context.userId).all(),
    subjectIds.length?db.prepare(`SELECT 'academic_subject' AS entity_type,id AS entity_id,0 AS entity_version,
      json_object('id',id,'title',title,'slug',slug,'code',code,'groupId',group_id) AS payload_json,NULL AS deleted_at,updated_at FROM subjects WHERE id IN (${subjectPlaceholders}) ORDER BY sort_order`).bind(...subjectIds).all():Promise.resolve({results:[]}),
    subjectIds.length?db.prepare(`SELECT 'academic_chapter' AS entity_type,c.id AS entity_id,0 AS entity_version,
      json_object('id',c.id,'title',c.title,'slug',c.slug,'number',c.chapter_number,'subjectId',sv.subject_id) AS payload_json,NULL AS deleted_at,c.updated_at
      FROM chapters c JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id WHERE sv.subject_id IN (${subjectPlaceholders}) ORDER BY sv.subject_id,c.sort_order LIMIT 3000`).bind(...subjectIds).all():Promise.resolve({results:[]}),
    context.selection?.attemptKey?db.prepare(`SELECT 'attempt' AS entity_type,id AS entity_id,0 AS entity_version,
      json_object('attemptKey',attempt_key,'label',label,'startDate',start_date,'endDate',end_date,'status',status,'verificationStatus',verification_status) AS payload_json,NULL AS deleted_at,updated_at FROM exam_attempts WHERE attempt_key=?1 LIMIT 1`).bind(context.selection.attemptKey).all():Promise.resolve({results:[]}),
    db.prepare(`SELECT 'activity' AS entity_type,id AS entity_id,0 AS entity_version,
      json_object('title',event_type,'kind',event_type,'xp',xp_amount,'occurredAt',occurred_at) AS payload_json,NULL AS deleted_at,occurred_at AS updated_at FROM xp_ledger WHERE user_id=?1 ORDER BY occurred_at DESC LIMIT 100`).bind(context.userId).all(),
    db.prepare(`SELECT 'leaderboard' AS entity_type,p.user_id AS entity_id,0 AS entity_version,
      json_object('category','overall','rank',NULL,'score',COALESCE((SELECT SUM(xp_amount) FROM xp_ledger x WHERE x.user_id=p.user_id),0),'alias',p.public_alias,'optedIn',p.opted_in) AS payload_json,NULL AS deleted_at,p.updated_at
      FROM leaderboard_profiles p WHERE p.user_id=?1 LIMIT 1`).bind(context.userId).all(),
    db.prepare(`SELECT 'study_buddy' AS entity_type,r.id AS entity_id,0 AS entity_version,
      json_object('relationshipId',r.id,'name',COALESCE(p.display_name,'Study buddy'),'state',r.status,'otherUserId',CASE WHEN r.member_a_user_id=?1 THEN r.member_b_user_id ELSE r.member_a_user_id END) AS payload_json,
      NULL AS deleted_at,r.updated_at FROM study_buddy_relationships r LEFT JOIN profiles p ON p.user_id=CASE WHEN r.member_a_user_id=?1 THEN r.member_b_user_id ELSE r.member_a_user_id END
      WHERE r.member_a_user_id=?1 OR r.member_b_user_id=?1 ORDER BY r.updated_at DESC LIMIT 100`).bind(context.userId).all(),
    db.prepare(`SELECT entity_type,entity_id,entity_version,payload_json,deleted_at,updated_at
      FROM mobile_sync_entities WHERE user_id=?1 AND academic_context_key=?2 ORDER BY entity_type,updated_at,entity_id LIMIT 5000`).bind(context.userId,context.contextKey).all(),
  ]);
  const snapshot=[...(progress.results??[]),...(tasks.results??[]),...(notes.results??[]),...(sessions.results??[]),...(profile.results??[]),...(subjects.results??[]),...(chapters.results??[]),...(attempt.results??[]),...(activity.results??[]),...(leaderboard.results??[]),...(buddies.results??[])];
  const merged=new Map(snapshot.map(entity=>[`${String(entity.entity_type)}:${String(entity.entity_id)}`,entity]));
  for(const entity of tracked.results??[])merged.set(`${String(entity.entity_type)}:${String(entity.entity_id)}`,entity);
  const entities=[...merged.values()];
  const high=(await db.prepare("SELECT COALESCE(MAX(sequence),0) AS cursor FROM mobile_sync_changes WHERE user_id=?1 AND academic_context_key=?2")
    .bind(context.userId,context.contextKey).first<{cursor:number}>())?.cursor??0;
  return json(request,{schema:1,accountId:context.userId,academicContextKey:context.contextKey,cursor:String(high),context:{levelId:context.levelId,attemptKey:context.selection?.attemptKey??null,subjectIds:context.subjectIds},entities});
}
