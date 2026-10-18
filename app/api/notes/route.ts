import {hierarchyWriteNeedsReload} from '@/lib/notes/hierarchy-compatibility';
import {validateStructuredNote,renderStructuredNote,type StructuredNote} from "@/lib/notes/structured-document";
import { NextResponse } from "next/server";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { savePhase6Note } from "@/lib/notes/phase6";
import { cleanText, normalizeTags, nullableId, richTextToPlainText, sanitizeRichTextHtml } from "@/lib/resources/validation";
import { assertNoteContentSize } from '@/lib/notes/content-limits';
import { getD1RuntimeDatabase } from '@/lib/data/d1/client';
import { stageOfflineWrites } from '@/lib/offline/atomic';
import { offlineTransaction } from '@/lib/offline/transaction-context';
import {getHotD1Database} from '@/lib/data/d1/runtime';
import {getStudentContext} from '@/lib/academic/student-context';

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  if(!body||typeof body!=='object'||Array.isArray(body))return NextResponse.json({error:'Invalid note request.'},{status:400});

  if(body.expectedOwnerId!==undefined&&body.expectedOwnerId!==identity.id)return NextResponse.json({error:'Your account changed. Reopen this editor before saving.'},{status:409});
  if(typeof body.expectedContextKey==='string'&&(await getStudentContext()).contextKey!==body.expectedContextKey)return NextResponse.json({error:'Your study profile changed. Reopen this editor before saving.'},{status:409});
  const title = cleanText(body.title, 160);
  const rawHtml = typeof body.bodyHtml === "string" ? body.bodyHtml : "";
  let bodyHtml: string, bodyText: string;let document:StructuredNote|undefined;
  try { if(body.document!==undefined)document=validateStructuredNote(body.document);bodyHtml = document?renderStructuredNote(document):sanitizeRichTextHtml(rawHtml); bodyText = richTextToPlainText(bodyHtml); assertNoteContentSize(bodyHtml, bodyText); }
  catch (error) { const message=error instanceof Error?error.message:'Invalid document.';const large=/too large/i.test(message);return NextResponse.json({error:message,code:large?'DOCUMENT_TOO_LARGE':'INVALID_DOCUMENT'},{status:large?413:400}); }
  let visibility: "private" | "shared" = body.visibility === "shared" ? "shared" : "private";
  const noteId = typeof body.id === "string" && body.id.trim() && body.id.length<=160 ? body.id : null;
  if(body.id!==undefined&&body.id!==null&&!noteId)return NextResponse.json({error:'Invalid note ID.'},{status:400});
  if(document&&document.entryId!==(noteId??body.clientId))return NextResponse.json({error:'Document identity does not match this note.'},{status:400});
  const createId = !noteId && typeof body.clientId === "string" && /^[0-9a-f-]{36}$/i.test(body.clientId) ? body.clientId : null;
  let subjectId = nullableId(body.subjectId);
  let chapterId = nullableId(body.chapterId);
  let topicId = nullableId(body.topicId);
  const sourceMessageId = nullableId(body.sourceMessageId);
  let resourceIds = Array.isArray(body.resourceIds) ? body.resourceIds.filter((value): value is string => typeof value === "string") : [];
  let tags = normalizeTags(body.tags);
  if(document){try{validateStructuredNote(document,resourceIds);}catch(error){return NextResponse.json({error:String(error instanceof Error?error.message:error)},{status:400});}}

  if (!title) return NextResponse.json({ error: "A note title is required." }, { status: 400 });
  if (!bodyText && !bodyHtml) return NextResponse.json({ error: "Add some note content before saving." }, { status: 400 });

  try {
    if(noteId){
      const oldDocument=await getHotD1Database().prepare('SELECT document_json FROM note_revision_metadata WHERE note_id=?1 AND user_id=?2').bind(noteId,identity.id).first<{document_json:string}>();
      if(oldDocument?.document_json){let previous;try{previous=JSON.parse(oldDocument.document_json);}catch{}if(previous?.engine==='tiptap'&&(!document||previous.engineSchemaVersion!==1||previous.schemaVersion!==1))return NextResponse.json({error:'This note uses the new editor. Update or reload CA Progress before editing it.',code:'NOTE_EDITOR_REQUIRED'},{status:409});if(hierarchyWriteNeedsReload(previous,body.editorCapabilities))return NextResponse.json({error:'This hierarchy uses newer editing controls. Reload CA Progress before saving. Your saved note is unchanged.',code:'NOTE_EDITOR_REQUIRED'},{status:409});if(document&&previous?.legacyHtml)document={...document,legacyHtml:previous.legacyHtml};else if(document&&previous?.format==='html')document={...document,legacyHtml:previous.html};}
    }
    if(noteId){
      const db=getHotD1Database();
      const existing=await db.prepare('SELECT n.visibility,n.subject_id,n.chapter_id,m.topic_id FROM notes n LEFT JOIN note_revision_metadata m ON m.note_id=n.id AND m.user_id=n.user_id WHERE n.id=?1 AND n.user_id=?2').bind(noteId,identity.id).first<{visibility:string;subject_id:string|null;chapter_id:string|null;topic_id:string|null}>();
      if(existing){
        if(body.visibility===undefined)visibility=existing.visibility==='shared'?'shared':'private';
        if(body.subjectId===undefined)subjectId=existing.subject_id;
        if(body.chapterId===undefined)chapterId=existing.chapter_id;
        if(body.topicId===undefined)topicId=existing.topic_id;
        if(body.tags===undefined){const rows=await db.prepare('SELECT t.name FROM note_tags t JOIN note_tag_map m ON m.tag_id=t.id WHERE m.note_id=?1').bind(noteId).all<{name:string}>();tags=(rows.results??[]).map(row=>row.name);}
        if(body.resourceIds===undefined){const rows=await db.prepare('SELECT resource_id FROM note_resource_links WHERE note_id=?1 AND user_id=?2').bind(noteId,identity.id).all<{resource_id:string}>();resourceIds=(rows.results??[]).map(row=>row.resource_id);}
      }
    }
    const requestHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({title,bodyHtml,document,subjectId,chapterId,topicId,tags,visibility,sourceMessageId,resourceIds})))),byte=>byte.toString(16).padStart(2,'0')).join('');
    if(createId){
      const existing=await getHotD1Database().prepare("SELECT n.id,n.moderation_status,n.visibility,r.request_hash FROM notes n LEFT JOIN note_create_receipts r ON r.note_id=n.id AND r.owner_user_id=n.user_id WHERE n.id=?1 AND n.user_id=?2 AND NOT EXISTS(SELECT 1 FROM resource_workspace_entries w WHERE w.entity_kind='note' AND w.entity_id=n.id AND w.trashed_at IS NOT NULL)").bind(createId,identity.id).first<{id:string;moderation_status:string;visibility:string;request_hash:string|null}>();
      if(existing){const revision=await getHotD1Database().prepare("SELECT COALESCE(max(id),0) revision FROM resource_file_activity WHERE entity_kind='note' AND entity_id=?1 AND owner_user_id=?2").bind(existing.id,identity.id).first<{revision:number}>();if(existing.request_hash!==requestHash)return NextResponse.json({id:existing.id,noteRevision:revision?.revision??0,error:'An earlier version is already saved. Your latest edits remain here; save again to update that note.'},{status:409});return NextResponse.json({id:existing.id,noteRevision:revision?.revision??0,status:existing.moderation_status,visibility:existing.visibility},{status:200});}
    }
    const profile = await getProfileForUser(identity.id);
    const save = async () => {const result=await savePhase6Note({
      id: noteId,
      createId,
      documentJson:document?JSON.stringify(document):undefined,
      userId: identity.id,
      ownerLabel: profile?.display_name?.trim() || "CA Progress student",
      title,
      bodyHtml,
      bodyText,
      subjectId,
      chapterId,
      topicId,
      tags,
      visibility,
      sourceMessageId,
      resourceIds,
    });
      if(createId)await getHotD1Database().prepare('INSERT INTO note_create_receipts(note_id,owner_user_id,request_hash) VALUES(?1,?2,?3)').bind(result.id,identity.id,requestHash).run();
      return result;
    };
    // An offline replay already has a larger receipt/guard transaction. Online
    // saves stage note, tags, attribution and linked files in one atomic batch.
    const outer = offlineTransaction.getStore();
    let result: Awaited<ReturnType<typeof save>>;
    if (outer) result = await save();
    else {
      const real = getD1RuntimeDatabase(); const staged = stageOfflineWrites(real);
      result = await offlineTransaction.run({db:staged.db,afterCommit:[]}, save);
      if(noteId&&typeof body.expectedRevision==='number'){
        const guardId=crypto.randomUUID();
        const guard=real.prepare("INSERT INTO resource_save_guards(id,ok) VALUES(?1,CASE WHEN (SELECT COALESCE(max(id),0) FROM resource_file_activity WHERE entity_kind='note' AND entity_id=?2 AND owner_user_id=?3)=?4 THEN 1 ELSE 0 END)").bind(guardId,noteId,identity.id,body.expectedRevision);
        await real.batch([guard,...staged.writes,real.prepare('DELETE FROM resource_save_guards WHERE id=?1').bind(guardId)]);
      }else await real.batch(staged.writes);
    }
    const revisionRow=await getHotD1Database().prepare("SELECT COALESCE(max(id),0) revision FROM resource_file_activity WHERE entity_kind='note' AND entity_id=?1 AND owner_user_id=?2").bind(result.id,identity.id).first<{revision:number}>();
    return NextResponse.json({ id: result.id, status: result.status, visibility: result.visibility,noteRevision:revisionRow?.revision??0 }, { status: noteId ? 200 : 201 });
  } catch (error) {
    if(/resource_save_guards|CHECK constraint/i.test(String(error)))return NextResponse.json({error:'This note changed on another device. Your draft is retained; reload the saved note before applying your edits.',code:'NOTE_REVISION_CONFLICT'},{status:409});
    return NextResponse.json({ error: error instanceof Error ? error.message : "Note could not be saved." }, { status: 400 });
  }
}
