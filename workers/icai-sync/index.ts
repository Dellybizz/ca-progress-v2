import {
  IcaiSyncAlreadyRunningError,
  failIcaiSyncContinuationSource,
  finalizeIcaiSyncContinuationEngine,
  runIcaiSyncContinuationSource,
  runIcaiSyncEngine,
  startIcaiSyncContinuationEngine,
} from "./sync-engine";
import type { D1Database } from "./d1-client";

type Env = { DB?: D1Database };
type SyncRequest = { trigger?: unknown; requestedBy?: unknown; orchestrationKey?: unknown; runId?: unknown; sourceId?: unknown; errorMessage?: unknown; requestedSourceIds?: unknown; forceRecheck?: unknown };
const INTERNAL_MARKER = "ca-progress-v2-web";
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store"}});}
function runtime(request: Request, db: D1Database) {
  return {
    db,
    userAgent: request.headers.get("x-ca-progress-icai-user-agent")?.trim()||"CA Progress V2 Official ICAI Monitor/phase8",
    enabled: request.headers.get("x-ca-progress-icai-enabled")!=="false",
  };
}
function boundedString(value: unknown, max = 200) { return typeof value === "string" && value.length > 0 && value.length <= max ? value : null; }

const icaiSyncWorker = {
  async fetch(request:Request,env:Env){
    const url=new URL(request.url);
    if(request.method==="GET"&&url.pathname==="/health"){
      if(request.headers.get("x-ca-progress-internal")!==INTERNAL_MARKER)return json({ok:false,error:"Internal service request required."},403);
      return json({ok:true,databaseConfigured:Boolean(env.DB),persistence:"cloudflare-d1"});
    }
    if(request.method!=="POST"||!["/run","/start","/source","/source/fail","/finalize"].includes(url.pathname))return json({ok:false,error:"Not found."},404);
    if(request.headers.get("x-ca-progress-internal")!==INTERNAL_MARKER)return json({ok:false,error:"Internal service request required."},403);
    if(!env.DB)return json({ok:false,error:"Internal D1 sync runtime is not configured."},503);
    const body=await request.json().catch(()=>null) as SyncRequest|null;
    const config=runtime(request,env.DB);
    try{
      if(url.pathname==="/source"||url.pathname==="/source/fail"){
        const runId=boundedString(body?.runId);
        const sourceId=boundedString(body?.sourceId);
        if(!runId||!sourceId)return json({ok:false,error:"runId and sourceId are required."},400);
        if(url.pathname==="/source/fail"){
          const errorMessage=boundedString(body?.errorMessage,2000)||"ICAI source batch exhausted its retry limit.";
          const result=await failIcaiSyncContinuationSource(config,{runId,sourceId,errorMessage});
          return json({ok:true,result});
        }
        const result=await runIcaiSyncContinuationSource(config,{runId,sourceId});
        return json({ok:true,result});
      }
      if(url.pathname==="/finalize"){
        const runId=boundedString(body?.runId);
        if(!runId)return json({ok:false,error:"runId is required."},400);
        const summary=await finalizeIcaiSyncContinuationEngine(config,{runId});
        return json({ok:true,summary});
      }
      const trigger=body?.trigger;
      if(trigger!=="cron"&&trigger!=="manual"&&trigger!=="test")return json({ok:false,error:"Invalid sync trigger."},400);
      const requestedBy=typeof body?.requestedBy==="string"&&body.requestedBy.length<=200?body.requestedBy:null;
      if(url.pathname==="/start"){
        const orchestrationKey=boundedString(body?.orchestrationKey,180);
        if(!orchestrationKey)return json({ok:false,error:"orchestrationKey is required."},400);
        const requestedSourceIds=Array.isArray(body?.requestedSourceIds)?body.requestedSourceIds.filter((value):value is string=>typeof value==="string"&&value.length<=200).slice(0,20):[];
        const result=await startIcaiSyncContinuationEngine(config,{trigger,requestedBy,orchestrationKey,requestedSourceIds,forceRecheck:body?.forceRecheck===true});
        return json({ok:true,result});
      }
      const summary=await runIcaiSyncEngine(config,{trigger,requestedBy});
      return json({ok:true,summary});
    }
    catch(error){if(error instanceof IcaiSyncAlreadyRunningError)return json({ok:false,error:error.message},409);return json({ok:false,error:error instanceof Error?error.message:"ICAI synchronization failed."},500);}
  },
};

export default icaiSyncWorker;
