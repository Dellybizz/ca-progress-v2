import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getResourceR2Bucket, RESOURCE_R2_STORAGE_BUCKET } from "@/lib/resources/r2";
import { cleanText, nullableId } from "@/lib/resources/validation";
import { deleteHotResource, getHotOwnedResource, patchHotResource } from "@/lib/data/d1/hot-screens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const title = cleanText(body.title, 160);
  if (!title) return NextResponse.json({ error: "A resource title is required." }, { status: 400 });
  const description = cleanText(body.description, 4000) || null;
  const subjectId = nullableId(body.subjectId);
  const chapterId = nullableId(body.chapterId);
  const visibility = body.visibility === "shared" ? "shared" : "private";

  try {
    const result = await patchHotResource({ id, userId: identity.id, title, description, subjectId, chapterId, visibility });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Resource could not be updated." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { id } = await params;
  const found = await getHotOwnedResource(id, identity.id);
  if (!found) return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  if (found.storage_bucket !== RESOURCE_R2_STORAGE_BUCKET) {
    return NextResponse.json({ error: "This resource is not stored in the current R2 bucket." }, { status: 409 });
  }

  let bucket;
  try { bucket = getResourceR2Bucket(); }
  catch { return NextResponse.json({ error: "Cloudflare R2 file storage is not configured." }, { status: 503 }); }

  try { await bucket.delete(found.storage_path); }
  catch {
    return NextResponse.json({ error: "Cloudflare R2 could not delete this file." }, { status: 502 });
  }

  await deleteHotResource(id, identity.id);
  return NextResponse.json({ ok: true });
}
