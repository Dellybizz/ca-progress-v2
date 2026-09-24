import { NextResponse, type NextRequest } from "next/server";
import { getStudentContext } from "@/lib/academic/student-context";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { decodeCursor, readDelta } from "@/lib/mobile/sync";

export const dynamic="force-dynamic";
const json=(request:NextRequest,data:unknown,status=200)=>NextResponse.json(data,{status,headers:{...MOBILE_API_HEADERS,...nativeCorsHeaders(request)}});
export const OPTIONS=(request:NextRequest)=>nativeOptions(request);
export async function GET(request:NextRequest){
  const context=await getStudentContext();
  if(context.mode!=="ready"||!context.userId)return json(request,{error:{code:"AUTH_REQUIRED",message:"Sign in to synchronize.",retryable:false}},401);
  if(request.nextUrl.searchParams.get("context")!==context.contextKey)return json(request,{error:{code:"CONTEXT_CHANGED",message:"Academic context changed. Pending edits were not applied.",retryable:false}},409);
  try{return json(request,{schema:1,academicContextKey:context.contextKey,...await readDelta(context.userId,context.contextKey,decodeCursor(request.nextUrl.searchParams.get("cursor")))});}
  catch(error){if(String(error).includes("INVALID_CURSOR"))return json(request,{error:{code:"INVALID_CURSOR",message:"The synchronization cursor is invalid.",retryable:false}},400);throw error;}
}
