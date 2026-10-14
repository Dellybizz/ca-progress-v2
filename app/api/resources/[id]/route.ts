import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import {mutateWorkspace} from "@/lib/resources/workspace";
import { cleanText, nullableId } from "@/lib/resources/validation";
import { getHotOwnedResource, patchHotResource } from "@/lib/data/d1/hot-screens";

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
  const result=await mutateWorkspace(identity.id,{action:'trash',keys:[`upload:${id}`]});
  const failure='results' in result ? result.results?.find(item=>!item.ok) : null;
  return failure ? NextResponse.json({error:failure.error},{status:400}) : NextResponse.json({ok:true});
}
