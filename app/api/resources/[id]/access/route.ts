import {getHotD1Database} from '@/lib/data/d1/runtime';
import {versionStorage} from '@/lib/resources/lifecycle';
import {isWorkspaceTrashed} from '@/lib/resources/workspace';
import {touchStorageFile} from "@/lib/billing/storage-cleanup.mjs";
import {getD1RuntimeDatabase} from "@/lib/data/d1/client";
import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createR2PresignedUrl } from "@/lib/resources/r2-presign";
import { RESOURCE_R2_STORAGE_BUCKET } from "@/lib/resources/r2";
import { createD1ServerClient } from "@/lib/data/d1/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeDownloadName(value: unknown) {
  return String(value || "resource").replace(/["\\\r\n]/g, "_").slice(0, 180);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const { id } = await params;
  if(await isWorkspaceTrashed("upload",id))return NextResponse.json({error:"Resource not found."},{status:404});
  const client = await createD1ServerClient();
  const response = await client.from("uploaded_resources")
    .select("id,owner_user_id,visibility,moderation_status,storage_bucket,storage_path,original_filename,mime_type")
    .eq("id", id).maybeSingle();
  if (response.error || !response.data) return NextResponse.json({ error: "Resource not found or access denied." }, { status: 404 });
  const row = response.data;
  const allowed = row.owner_user_id === identity.id || (row.visibility === "shared" && row.moderation_status === "approved");
  if (!allowed) return NextResponse.json({ error: "Resource not found or access denied." }, { status: 404 });
  if(row.owner_user_id===identity.id){const version=await versionStorage(id,identity.id);if(version)Object.assign(row,version);}
  const inspected=await getHotD1Database().prepare('SELECT state FROM resource_inspections WHERE source_key=?1 AND owner_user_id=?2 LIMIT 1').bind(row.storage_path,row.owner_user_id).first<{state:string}>();
  if(inspected&&['quarantined','failed'].includes(inspected.state))return NextResponse.json({error:'This file did not pass inspection.'},{status:423,headers:{'Cache-Control':'private, no-store'}});
  if((!inspected&&(String(row.storage_path).startsWith('files/')||String(row.storage_path).includes('/copies/')))||inspected&&['queued','processing'].includes(inspected.state))return NextResponse.json({error:'This file is still being checked. Retry shortly.'},{status:425,headers:{'Cache-Control':'private, no-store','Retry-After':'5'}});
  if (row.storage_bucket !== RESOURCE_R2_STORAGE_BUCKET) return NextResponse.json({ error: "This legacy resource is not stored in Cloudflare R2." }, { status: 409 });
  try {
    const download = new URL(request.url).searchParams.get("download") === "1";
    const filename = safeDownloadName(row.original_filename);
    const signed = await createR2PresignedUrl({
      key: row.storage_path,
      method: "GET",
      expiresInSeconds: 120,
      responseContentDisposition: `${download ? "attachment" : "inline"}; filename="${filename}"`,
      responseContentType: String(row.mime_type || "application/octet-stream"),
    });
    if(!await touchStorageFile(getD1RuntimeDatabase(),"resource",id,identity.id))return NextResponse.json({error:"File cleanup is being confirmed."},{status:404});
    return NextResponse.redirect(signed.url, { status: 307, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Signed R2 download is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
