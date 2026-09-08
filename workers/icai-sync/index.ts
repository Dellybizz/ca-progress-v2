import { IcaiSyncAlreadyRunningError, runIcaiSyncEngine } from "./sync-engine";
import type { D1Database } from "./d1-client";

type Env = { DB?: D1Database };
type SyncRequest = {
  trigger?: unknown;
  requestedBy?: unknown;
  retryRunId?: unknown;
  retryMode?: unknown;
  retryItemId?: unknown;
};
const INTERNAL_MARKER = "ca-progress-v2-web";
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store"}});}
function optionalId(value:unknown){return typeof value==="string"&&value.length>0&&value.length<=200?value:null;}

const icaiSyncWorker = {
  async fetch(request:Request,env:Env){
    const url=new URL(request.url);
    if(request.method==="GET"&&url.pathname==="/health"){
      if(request.headers.get("x-ca-progress-internal")!==INTERNAL_MARKER)return json({ok:false,error:"Internal service request required."},403);
      return json({ok:true,databaseConfigured:Boolean(env.DB),persistence:"cloudflare-d1"});
    }
    if(request.method!=="POST"||url.pathname!=="/run")return json({ok:false,error:"Not found."},404);
    if(request.headers.get("x-ca-progress-internal")!==INTERNAL_MARKER)return json({ok:false,error:"Internal service request required."},403);
    if(!env.DB)return json({ok:false,error:"Internal D1 sync runtime is not configured."},503);
    const body=await request.json().catch(()=>null) as SyncRequest|null;
    const trigger=body?.trigger;
    if(trigger!=="cron"&&trigger!=="manual"&&trigger!=="test")return json({ok:false,error:"Invalid sync trigger."},400);
    const requestedBy=optionalId(body?.requestedBy);
    const retryRunId=optionalId(body?.retryRunId);
    const retryItemId=optionalId(body?.retryItemId);
    const retryMode=body?.retryMode;
    if(retryMode!==undefined&&retryMode!==null&&retryMode!=="failed"&&retryMode!=="timed_out"&&retryMode!=="item")return json({ok:false,error:"Invalid ICAI retry mode."},400);
    if((retryMode&&!retryRunId)||(!retryMode&&retryRunId))return json({ok:false,error:"ICAI retry run and mode must be provided together."},400);
    if(retryMode==="item"&&!retryItemId)return json({ok:false,error:"A retry item id is required for item retry."},400);
    const userAgent=request.headers.get("x-ca-progress-icai-user-agent")?.trim()||"CA Progress V2 Official ICAI Monitor/phase8";
    const enabled=request.headers.get("x-ca-progress-icai-enabled")!=="false";
    try{
      const summary=await runIcaiSyncEngine(
        {db:env.DB,enabled,userAgent},
        {
          trigger,
          requestedBy,
          retryRunId,
          retryMode:retryMode==="failed"||retryMode==="timed_out"||retryMode==="item"?retryMode:null,
          retryItemId,
        },
      );
      return json({ok:true,summary});
    }
    catch(error){if(error instanceof IcaiSyncAlreadyRunningError)return json({ok:false,error:error.message},409);return json({ok:false,error:error instanceof Error?error.message:"ICAI synchronization failed."},500);}
  },
};

export default icaiSyncWorker;
