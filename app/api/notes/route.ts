import { NextResponse } from "next/server";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { savePhase6Note } from "@/lib/notes/phase6";
import { cleanText, normalizeTags, nullableId, richTextToPlainText, sanitizeRichTextHtml } from "@/lib/resources/validation";
import { assertNoteContentSize } from '@/lib/notes/content-limits';
import { getD1RuntimeDatabase } from '@/lib/data/d1/client';
import { stageOfflineWrites } from '@/lib/offline/atomic';
import { offlineTransaction } from '@/lib/offline/transaction-context';
import {getHotD1Database} from '@/lib/data/d1/runtime';

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  if(!body||typeof body!=='object'||Array.isArray(body))return NextResponse.json({error:'Invalid note request.'},{status:400});

  const title = cleanText(body.title, 160);
  const rawHtml = typeof body.bodyHtml === "string" ? body.bodyHtml : "";
  let bodyHtml: string, bodyText: string;
  try { bodyHtml = sanitizeRichTextHtml(rawHtml); bodyText = richTextToPlainText(bodyHtml); assertNoteContentSize(bodyHtml, bodyText); }
  catch (error) { return NextResponse.json({error:error instanceof Error ? error.message : 'Note is too large.', code:'DOCUMENT_TOO_LARGE'}, {status:413}); }
  const visibility = body.visibility === "shared" ? "shared" : "private";
  const noteId = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  const createId = !noteId && typeof body.clientId === "string" && /^[0-9a-f-]{36}$/i.test(body.clientId) ? body.clientId : null;
  const subjectId = nullableId(body.subjectId);
  const chapterId = nullableId(body.chapterId);
  const topicId = nullableId(body.topicId);
  const sourceMessageId = nullableId(body.sourceMessageId);
  const resourceIds = Array.isArray(body.resourceIds) ? body.resourceIds.filter((value): value is string => typeof value === "string") : [];
  const tags = normalizeTags(body.tags);

  if (!title) return NextResponse.json({ error: "A note title is required." }, { status: 400 });
  if (!bodyText && !bodyHtml) return NextResponse.json({ error: "Add some note content before saving." }, { status: 400 });

  try {
    const requestHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({title,bodyHtml,subjectId,chapterId,topicId,tags,visibility,sourceMessageId,resourceIds})))),byte=>byte.toString(16).padStart(2,'0')).join('');
    if(createId){
      const existing=await getHotD1Database().prepare("SELECT n.id,n.moderation_status,n.visibility,r.request_hash FROM notes n LEFT JOIN note_create_receipts r ON r.note_id=n.id AND r.owner_user_id=n.user_id WHERE n.id=?1 AND n.user_id=?2 AND NOT EXISTS(SELECT 1 FROM resource_workspace_entries w WHERE w.entity_kind='note' AND w.entity_id=n.id AND w.trashed_at IS NOT NULL)").bind(createId,identity.id).first<{id:string;moderation_status:string;visibility:string;request_hash:string|null}>();
      if(existing){if(existing.request_hash!==requestHash)return NextResponse.json({id:existing.id,error:'An earlier version is already saved. Your latest edits remain here; save again to update that note.'},{status:409});return NextResponse.json({id:existing.id,status:existing.moderation_status,visibility:existing.visibility},{status:200});}
    }
    const profile = await getProfileForUser(identity.id);
    const save = async () => {const result=await savePhase6Note({
      id: noteId,
      createId,
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
      await real.batch(staged.writes);
    }
    return NextResponse.json({ id: result.id, status: result.status, visibility: result.visibility }, { status: noteId ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Note could not be saved." }, { status: 400 });
  }
}
