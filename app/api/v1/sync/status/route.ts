import { NextResponse, type NextRequest } from "next/server";
import { getStudentContext } from "@/lib/academic/student-context";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { SYNC_CHANGE_RETENTION_DAYS, SYNC_PAGE_LIMIT, SYNC_TOMBSTONE_RETENTION_DAYS } from "@/lib/mobile/sync";
export const dynamic="force-dynamic";
const json=(r:NextRequest,d:unknown,s=200)=>NextResponse.json(d,{status:s,headers:{...MOBILE_API_HEADERS,...nativeCorsHeaders(r)}});
export const OPTIONS=(r:NextRequest)=>nativeOptions(r);
export async function GET(request:NextRequest){const context=await getStudentContext();if(context.mode!=="ready"||!context.userId)return json(request,{error:{code:"AUTH_REQUIRED",message:"Sign in to synchronize.",retryable:false}},401);const db=getD1RuntimeDatabase();const range=await db.prepare("SELECT COALESCE(MIN(sequence),0) AS oldest,COALESCE(MAX(sequence),0) AS latest,COUNT(*) AS change_count FROM mobile_sync_changes WHERE user_id=?1 AND academic_context_key=?2").bind(context.userId,context.contextKey).first();return json(request,{schema:1,academicContextKey:context.contextKey,journal:range,limits:{page:SYNC_PAGE_LIMIT,changeRetentionDays:SYNC_CHANGE_RETENTION_DAYS,tombstoneRetentionDays:SYNC_TOMBSTONE_RETENTION_DAYS}});}
