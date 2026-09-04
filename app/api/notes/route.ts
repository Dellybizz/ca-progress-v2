import { NextResponse } from "next/server";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { createServerSupabaseClient, isCloudflareDataRuntime } from "@/lib/supabase/server";
import { saveHotNote } from "@/lib/data/d1/hot-screens";
import { cleanText, normalizeTags, nullableId, richTextToPlainText, sanitizeRichTextHtml } from "@/lib/resources/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const title = cleanText(body.title, 160);
  const rawHtml = typeof body.bodyHtml === "string" ? body.bodyHtml : "";
  const bodyHtml = sanitizeRichTextHtml(rawHtml);
  const bodyText = richTextToPlainText(bodyHtml);
  const visibility = body.visibility === "shared" ? "shared" : "private";
  const noteId = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  const subjectId = nullableId(body.subjectId);
  const chapterId = nullableId(body.chapterId);
  const tags = normalizeTags(body.tags);

  if (!title) return NextResponse.json({ error: "A note title is required." }, { status: 400 });
  if (!bodyText && !bodyHtml) return NextResponse.json({ error: "Add some note content before saving." }, { status: 400 });

  if (isCloudflareDataRuntime()) {
    try {
      const profile = await getProfileForUser(identity.id);
      const result = await saveHotNote({ id: noteId, userId: identity.id, ownerLabel: profile?.display_name?.trim() || "CA Progress student", title, bodyHtml, bodyText, subjectId, chapterId, tags, visibility });
      return NextResponse.json({ id: result.id, status: result.status }, { status: noteId ? 200 : 201 });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Note could not be saved." }, { status: 400 });
    }
  }

  const supabase = await createServerSupabaseClient();
  const response = await supabase.rpc("phase7_save_note", {
    p_note_id: noteId,
    p_title: title,
    p_body_html: bodyHtml,
    p_body_text: bodyText,
    p_subject_id: subjectId,
    p_chapter_id: chapterId,
    p_tags: tags,
    p_visibility: visibility,
  });
  if (response.error) return NextResponse.json({ error: response.error.message }, { status: response.error.code === "P0002" ? 404 : 400 });
  return NextResponse.json({ id: response.data, status: visibility === "shared" ? "pending" : "private" }, { status: noteId ? 200 : 201 });
}
