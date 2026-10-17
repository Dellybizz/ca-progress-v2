import { NextResponse, type NextRequest } from "next/server";
import { getStudentContext } from "@/lib/academic/student-context";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { POST as applyOfflineMutation } from "@/app/api/offline/mutations/route";
import { entityIdentity, SYNC_DOMAINS } from "@/lib/mobile/sync";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";

export const dynamic="force-dynamic";
const json=(r:NextRequest,d:unknown,s=200)=>NextResponse.json(d,{status:s,headers:{...MOBILE_API_HEADERS,...nativeCorsHeaders(r)}});
export const OPTIONS=(r:NextRequest)=>nativeOptions(r);
const paths=Object.keys(SYNC_DOMAINS) as Array<keyof typeof SYNC_DOMAINS>;
type Mutation={mutationId:string;contextKey:string;endpoint:keyof typeof SYNC_DOMAINS;body:Record<string,unknown>;expected:Record<string,unknown>|null;predecessor?:string|null;baseVersion?:number|null};
export async function POST(request:NextRequest){
  const context=await getStudentContext();
  if(context.mode!=="ready"||!context.userId)return json(request,{error:{code:"AUTH_REQUIRED",message:"Sign in to synchronize.",retryable:false}},401);
  const input=await request.json().catch(()=>null) as {mutations?:Mutation[]}|null;
  if(!input||!Array.isArray(input.mutations)||input.mutations.length<1||input.mutations.length>50)return json(request,{error:{code:"INVALID_BATCH",message:"Send between 1 and 50 mutations.",retryable:false}},400);
  const results:Array<Record<string,unknown>>=[];const blocked=new Set<string>();const db=getD1RuntimeDatabase();
  for(const mutation of input.mutations){
    if(!mutation||!paths.includes(mutation.endpoint)||mutation.contextKey!==context.contextKey){results.push({mutationId:mutation?.mutationId,status:"conflict",code:"CONTEXT_CHANGED"});blocked.add(mutation?.mutationId);continue;}
    if(mutation.predecessor&&blocked.has(mutation.predecessor)){results.push({mutationId:mutation.mutationId,status:"blocked",code:"DEPENDENCY_CONFLICT"});blocked.add(mutation.mutationId);continue;}
    if(Number.isInteger(mutation.baseVersion)){
      const current=await db.prepare("SELECT entity_version FROM mobile_sync_entities WHERE user_id=?1 AND academic_context_key=?2 AND entity_type=?3 AND entity_id=?4").bind(context.userId,context.contextKey,SYNC_DOMAINS[mutation.endpoint],entityIdentity(mutation.endpoint,mutation.body)).first<{entity_version:number}>();
      if(Number(current?.entity_version??0)!==mutation.baseVersion){results.push({mutationId:mutation.mutationId,status:"conflict",code:"STALE_VERSION",serverVersion:Number(current?.entity_version??0)});blocked.add(mutation.mutationId);continue;}
    }
    const forwarded=new Request(new URL("/api/offline/mutations",request.url),{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":mutation.mutationId,...(request.headers.get("authorization")?{Authorization:request.headers.get("authorization")!}:{})},body:JSON.stringify({ownerId:context.userId,contextKey:mutation.contextKey,url:mutation.endpoint,body:mutation.body,expected:mutation.expected,predecessor:mutation.predecessor})});
    const response=await applyOfflineMutation(forwarded);const body=await response.json().catch(()=>({}));
    if(response.ok)results.push({mutationId:mutation.mutationId,status:"applied",response:body});
    else if(response.status===409){results.push({mutationId:mutation.mutationId,status:"conflict",response:body});blocked.add(mutation.mutationId);}
    else results.push({mutationId:mutation.mutationId,status:"failed",retryable:response.status>=500,response:body});
  }
  return json(request,{schema:1,academicContextKey:context.contextKey,results});
}
