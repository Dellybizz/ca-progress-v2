import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { setHotProgressStageDate } from "@/lib/data/d1/hot-screens";
import { PROGRESS_STAGES } from "@/lib/progress/types";

export const dynamic = "force-dynamic";

type Body = Record<string, unknown>;
const itemKinds = ["personal_note","personal_file","icai_resource","community_note","community_resource"] as const;
const linkKinds = ["useful","youtube","revision"] as const;
function text(value:unknown,max:number){return typeof value==="string"?value.trim().slice(0,max):"";}
function validUrl(value:string){try{const url=new URL(value);return url.protocol==="https:"||url.protocol==="http:";}catch{return false;}}
async function assertChapter(userId:string,chapterId:string){
  const db=getD1RuntimeDatabase();
  const row=await db.prepare(`SELECT 1 AS valid FROM profiles p JOIN course_levels l ON l.code=p.ca_level
    JOIN chapters c ON c.id=?1 JOIN attempt_syllabus_map asm ON asm.syllabus_version_id=c.syllabus_version_id AND asm.level_id=l.id AND asm.attempt_key=p.attempt_key
    JOIN course_groups g ON g.id=asm.group_id WHERE p.user_id=?2 AND p.onboarding_completed_at IS NOT NULL
    AND (p.ca_level='foundation' OR p.group_choice IN ('both','not_applicable') OR g.code=p.group_choice) LIMIT 1`).bind(chapterId,userId).first();
  if(!row) throw new Error("This chapter is not available in your current academic profile.");
  return db;
}
async function assertAttachable(db:ReturnType<typeof getD1RuntimeDatabase>,userId:string,chapterId:string,sourceKind:string,sourceId:string){
  const chapter=await db.prepare("SELECT sv.subject_id AS subject_id FROM chapters c JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id WHERE c.id=?1 LIMIT 1").bind(chapterId).first<{subject_id:string}>();
  if(!chapter?.subject_id)throw new Error("This chapter is no longer available.");
  let row;
  if(sourceKind==="personal_note")row=await db.prepare("SELECT 1 FROM notes WHERE id=?1 AND user_id=?2 LIMIT 1").bind(sourceId,userId).first();
  if(sourceKind==="personal_file")row=await db.prepare("SELECT 1 FROM uploaded_resources WHERE id=?1 AND owner_user_id=?2 LIMIT 1").bind(sourceId,userId).first();
  if(sourceKind==="community_note")row=await db.prepare("SELECT 1 FROM notes WHERE id=?1 AND user_id<>?2 AND visibility='shared' AND moderation_status='approved' AND subject_id=?3 LIMIT 1").bind(sourceId,userId,chapter.subject_id).first();
  if(sourceKind==="community_resource")row=await db.prepare("SELECT 1 FROM uploaded_resources WHERE id=?1 AND owner_user_id<>?2 AND visibility='shared' AND moderation_status='approved' AND subject_id=?3 LIMIT 1").bind(sourceId,userId,chapter.subject_id).first();
  if(sourceKind==="icai_resource")row=await db.prepare(`SELECT 1 FROM autofetch_resource_records a JOIN icai_resources r ON r.id=a.resource_row_id
    WHERE a.canonical_resource_id=?1 AND a.is_current=1 AND r.status='active' AND r.verification_status='verified'
    LIMIT 1`).bind(sourceId).first();
  if(!row)throw new Error("This item is no longer available to attach.");
}

export async function POST(request:Request,{params}:{params:Promise<{chapterId:string}>}){
  const identity=await optionalUser();
  if(!identity)return NextResponse.json({error:"Sign in to update this chapter."},{status:401});
  const {chapterId}=await params;
  let body:Body; try{body=await request.json() as Body;}catch{return NextResponse.json({error:"Invalid request."},{status:400});}
  try{
    const db=await assertChapter(identity.id,chapterId);
    if(body.action==="set_stage_date"){
      const stage=text(body.stage,20);
      const date=body.date===null||body.date===""?null:text(body.date,10);
      if(!PROGRESS_STAGES.includes(stage as typeof PROGRESS_STAGES[number]))throw new Error("Choose a valid progress stage.");
      const result=await setHotProgressStageDate(identity.id,chapterId,stage,date,db);revalidatePath("/progress");revalidatePath(`/chapters/${chapterId}`);return NextResponse.json(result);
    }
    if(body.action==="set_understanding"){
      const level=Number(body.level);
      if(!Number.isInteger(level)||level<0||level>100)throw new Error("Understanding must be a whole number from 0 to 100.");
      await db.prepare(`INSERT INTO chapter_workspace_preferences(user_id,chapter_id,understanding_level,updated_at) VALUES(?1,?2,?3,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id,chapter_id) DO UPDATE SET understanding_level=excluded.understanding_level,updated_at=CURRENT_TIMESTAMP`).bind(identity.id,chapterId,level).run();
      revalidatePath(`/chapters/${chapterId}`);return NextResponse.json({ok:true,level});
    }
    if(body.action==="add_link"){
      const kind=text(body.kind,20),title=text(body.title,160),url=text(body.url,2048);
      if(!linkKinds.includes(kind as typeof linkKinds[number]))throw new Error("Choose a valid link type.");
      if(!title)throw new Error("Add a link title.");
      if(!validUrl(url))throw new Error("Use a valid http or https link.");
      const id=crypto.randomUUID();
      await db.prepare("INSERT INTO chapter_workspace_links(id,user_id,chapter_id,link_kind,title,url) VALUES(?1,?2,?3,?4,?5,?6)").bind(id,identity.id,chapterId,kind,title,url).run();
      return NextResponse.json({ok:true,link:{id,kind,title,url}},{status:201});
    }
    if(body.action==="remove_link"){
      await db.prepare("DELETE FROM chapter_workspace_links WHERE id=?1 AND user_id=?2 AND chapter_id=?3").bind(text(body.id,80),identity.id,chapterId).run();
      return NextResponse.json({ok:true});
    }
    if(body.action==="attach_item"){
      const sourceKind=text(body.sourceKind,30),sourceId=text(body.sourceId,180);
      if(!itemKinds.includes(sourceKind as typeof itemKinds[number])||!sourceId)throw new Error("Choose an item to attach.");
      await assertAttachable(db,identity.id,chapterId,sourceKind,sourceId);
      const id=crypto.randomUUID();
      await db.prepare("INSERT OR IGNORE INTO chapter_workspace_items(id,user_id,chapter_id,source_kind,source_id) VALUES(?1,?2,?3,?4,?5)").bind(id,identity.id,chapterId,sourceKind,sourceId).run();
      const saved=await db.prepare("SELECT id FROM chapter_workspace_items WHERE user_id=?1 AND chapter_id=?2 AND source_kind=?3 AND source_id=?4 LIMIT 1").bind(identity.id,chapterId,sourceKind,sourceId).first<{id:string}>();
      revalidatePath(`/chapters/${chapterId}`);return NextResponse.json({ok:true,id:saved?.id??id},{status:201});
    }
    if(body.action==="remove_item"){
      await db.prepare("DELETE FROM chapter_workspace_items WHERE id=?1 AND user_id=?2 AND chapter_id=?3").bind(text(body.id,80),identity.id,chapterId).run();
      return NextResponse.json({ok:true});
    }
    return NextResponse.json({error:"Unknown chapter action."},{status:400});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Chapter could not be updated."},{status:400});
  }
}
