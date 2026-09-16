import p3Worker from "./p3";

type D1Result<T=Record<string,unknown>>={results?:T[];success?:boolean;meta?:{changes?:number}};
type D1Statement={bind(...values:unknown[]):D1Statement;first<T=Record<string,unknown>>():Promise<T|null>;all<T=Record<string,unknown>>():Promise<D1Result<T>>;run<T=Record<string,unknown>>():Promise<D1Result<T>>};
type D1Database={prepare(query:string):D1Statement;batch<T=Record<string,unknown>>(statements:D1Statement[]):Promise<D1Result<T>[]>};
type QueueBinding={send(message:BillingJob):Promise<void>};
type Env={DB?:D1Database;BILLING_OPS_QUEUE?:QueueBinding;RAZORPAY_WEBHOOK_SECRET?:string};
type Row=Record<string,unknown>;
type BillingJob={kind:"webhook";raw:string;signature:string;eventId:string|null}|{kind:"reconcile";subscriptionId:string;userId:string;reason:string;runId:string|null};
type QueueMessage<T>={body:T;ack():void;retry():void};
type QueueBatch<T>={messages:QueueMessage<T>[]};
type ScheduledController={scheduledTime:number};

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"private, no-store"}});
const now=()=>new Date().toISOString();
const uuid=()=>crypto.randomUUID();
const database=(env:Env)=>{if(!env.DB)throw new Error("Billing D1 binding is missing.");return env.DB;};
async function hmac(secret:string,value:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));return[...new Uint8Array(signature)].map(byte=>byte.toString(16).padStart(2,"0")).join("");}
function equal(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
const clean=(value:unknown,limit=500)=>String(value??"").trim().slice(0,limit);
const ownerRole=(value:string)=>value==="owner"||value==="parent_owner";
const confirmationFor=(action:string)=>`CONFIRM ${action.toUpperCase().replaceAll("_"," ")}`;

async function audit(db:D1Database,input:{actorId:string;actorRole:string;action:string;targetType:string;targetId:string|null;reason:string;traceId:string;previous?:unknown;next?:unknown;reversible?:boolean}){
  await db.prepare(`INSERT INTO admin_audit_events(id,actor_user_id,actor_role,capability,action,target_type,target_id,reason,previous_value,new_value,trace_id,reversible,created_at)
    VALUES(?1,?2,?3,'billing.manage',?4,?5,?6,?7,?8,?9,?10,?11,?12)`)
    .bind(uuid(),input.actorId,input.actorRole,input.action,input.targetType,input.targetId,input.reason,
      input.previous===undefined?null:JSON.stringify(input.previous),input.next===undefined?null:JSON.stringify(input.next),
      input.traceId,input.reversible?1:0,now()).run();
}

async function queueWebhook(request:Request,env:Env){
  const secret=env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if(!secret)return p3Worker.fetch(request,env as never);
  const clone=request.clone(),raw=await request.text(),signature=clean(request.headers.get("x-razorpay-signature")).toLowerCase();
  if(!signature)return json({error:"Webhook signature is missing."},400);
  const expected=await hmac(secret,raw);if(!equal(expected,signature))return json({error:"Webhook signature verification failed."},400);
  if(!env.BILLING_OPS_QUEUE)return p3Worker.fetch(clone,env as never);
  const eventId=request.headers.get("x-razorpay-event-id");
  await env.BILLING_OPS_QUEUE.send({kind:"webhook",raw,signature,eventId});
  return json({ok:true,queued:true},202);
}

async function openCase(db:D1Database,row:Row,reasonCode:string,severity:"info"|"warning"|"critical",expected:unknown={},observed:unknown={}){
  const caseKey=`${row.id}:${reasonCode}`,timestamp=now();
  await db.prepare(`INSERT INTO billing_reconciliation_cases(id,case_key,user_id,razorpay_subscription_id,provider_subscription_id,entity_type,entity_id,reason_code,severity,state,expected_json,observed_json,first_seen_at,last_seen_at)
    VALUES(?1,?2,?3,?4,?5,'subscription',?5,?6,?7,'open',?8,?9,?10,?10)
    ON CONFLICT(case_key) DO UPDATE SET severity=excluded.severity,observed_json=excluded.observed_json,last_seen_at=excluded.last_seen_at,state=CASE WHEN billing_reconciliation_cases.state='resolved' THEN 'open' ELSE billing_reconciliation_cases.state END,resolved_at=NULL,resolved_by=NULL`)
    .bind(uuid(),caseKey,row.user_id,row.id,row.provider_subscription_id,reasonCode,severity,JSON.stringify(expected),JSON.stringify(observed),timestamp).run();
  if(severity==="critical"){
    await db.prepare(`INSERT INTO billing_operational_alerts(id,alert_key,reconciliation_case_id,user_id,alert_type,severity,state,message,created_at,updated_at)
      SELECT ?1,?2,id,user_id,?3,'critical','open',?4,?5,?5 FROM billing_reconciliation_cases WHERE case_key=?6
      ON CONFLICT(alert_key) DO UPDATE SET state='open',message=excluded.message,updated_at=excluded.updated_at,resolved_at=NULL`)
      .bind(uuid(),`critical:${caseKey}`,reasonCode,`Billing reconciliation needs attention: ${reasonCode}.`,timestamp,caseKey).run();
  }
}

async function performSync(env:Env,job:Extract<BillingJob,{kind:"reconcile"}>){
  const db=database(env),bucket=Math.floor(Date.now()/3600000),requestId=`p4recon_${job.subscriptionId}_${bucket}`.replace(/[^A-Za-z0-9_-]/g,"_").slice(0,100);
  const response=await p3Worker.fetch(new Request("https://billing.internal/subscription-action",{method:"POST",headers:{"x-ca-progress-internal":"ca-progress-v2-web","x-ca-progress-user-id":job.userId,"content-type":"application/json"},body:JSON.stringify({subscriptionId:job.subscriptionId,action:"sync",requestId})}),env as never);
  const payload=await response.clone().json().catch(()=>null);
  const local=await db.prepare("SELECT * FROM razorpay_subscriptions WHERE provider_subscription_id=?1 LIMIT 1").bind(job.subscriptionId).first<Row>();
  if(local){
    const financial=clean(local.financial_state,40);
    if(["mismatch","failed","disputed"].includes(financial))await openCase(db,local,`financial_${financial}`,financial==="mismatch"||financial==="disputed"?"critical":"warning",{financial_state:"paid"},{financial_state:financial});
    else await db.prepare("UPDATE billing_reconciliation_cases SET state='resolved',resolved_at=?1,last_seen_at=?1 WHERE razorpay_subscription_id=?2 AND state<>'resolved' AND reason_code IN ('stale_provider_reconciliation','financial_mismatch','financial_failed','financial_disputed')").bind(now(),local.id).run();
  }
  if(job.runId)await db.prepare(`UPDATE billing_reconciliation_runs SET reconciled_count=reconciled_count+?1,error_count=error_count+?2,mismatch_count=mismatch_count+?3 WHERE id=?4`)
    .bind(response.ok?1:0,response.ok?0:1,local&&["mismatch","failed","disputed"].includes(clean(local.financial_state,40))?1:0,job.runId).run();
  if(!response.ok)throw new Error(`reconciliation_failed_${response.status}`);
  return payload;
}

async function adminAction(request:Request,env:Env){
  const actorId=clean(request.headers.get("x-ca-progress-user-id"),128),actorRole=clean(request.headers.get("x-ca-progress-actor-role"),32);
  if(!actorId||!ownerRole(actorRole))return json({error:"Owner or Parent Owner billing authority is required."},403);
  const body=await request.json().catch(()=>null) as {requestId?:unknown;action?:unknown;subscriptionId?:unknown;caseId?:unknown;targetPlanId?:unknown;confirmation?:unknown;reason?:unknown}|null;
  const requestId=clean(body?.requestId,100),action=clean(body?.action,60),confirmation=clean(body?.confirmation,100),reason=clean(body?.reason,1000);
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(requestId))return json({error:"A valid idempotency request ID is required."},400);
  if(confirmation!==confirmationFor(action))return json({error:`Type "${confirmationFor(action)}" to confirm this operation.`},400);
  if(reason.length<3)return json({error:"A reason is required."},400);
  const db=database(env),prior=await db.prepare("SELECT * FROM billing_operation_requests WHERE request_key=?1 LIMIT 1").bind(requestId).first<Row>();
  if(prior?.state==="completed")return json({ok:true,idempotent:true,result:JSON.parse(clean(prior.result_json)||"{}")});
  const subscriptionId=clean(body?.subscriptionId,100)||null,caseId=clean(body?.caseId,100)||null;
  await db.prepare(`INSERT OR IGNORE INTO billing_operation_requests(request_key,actor_user_id,actor_role,action,target_type,target_id,confirmation_text,state)
    VALUES(?1,?2,?3,?4,?5,?6,?7,'started')`).bind(requestId,actorId,actorRole,action,caseId?"reconciliation_case":"subscription",caseId||subscriptionId,confirmation).run();
  try{
    let result:unknown={};
    if(action==="ack_case"||action==="resolve_case"){
      if(!caseId)throw new Error("A reconciliation case is required.");
      const current=await db.prepare("SELECT * FROM billing_reconciliation_cases WHERE id=?1 LIMIT 1").bind(caseId).first<Row>();if(!current)throw new Error("Reconciliation case not found.");
      if(action==="ack_case")await db.prepare("UPDATE billing_reconciliation_cases SET state='acknowledged',acknowledged_by=?1,acknowledged_at=?2 WHERE id=?3 AND state='open'").bind(actorId,now(),caseId).run();
      else await db.prepare("UPDATE billing_reconciliation_cases SET state='resolved',resolved_by=?1,resolved_at=?2 WHERE id=?3").bind(actorId,now(),caseId).run();
      result={caseId,state:action==="ack_case"?"acknowledged":"resolved"};
    }else{
      if(!subscriptionId)throw new Error("A provider subscription ID is required.");
      const local=await db.prepare("SELECT * FROM razorpay_subscriptions WHERE provider_subscription_id=?1 LIMIT 1").bind(subscriptionId).first<Row>();if(!local)throw new Error("Subscription not found.");
      const mapped=action==="reconcile"?"sync":action;
      if(!["sync","pause","resume","cancel_period_end","change_plan"].includes(mapped))throw new Error("Unsupported bounded billing recovery action.");
      if(mapped==="sync"&&env.BILLING_OPS_QUEUE){await env.BILLING_OPS_QUEUE.send({kind:"reconcile",subscriptionId,userId:clean(local.user_id,128),reason:`admin:${reason}`,runId:null});result={queued:true,subscriptionId};}
      else{
        const p3request=`${requestId}_provider`.slice(0,100);
        const response=await p3Worker.fetch(new Request("https://billing.internal/subscription-action",{method:"POST",headers:{"x-ca-progress-internal":"ca-progress-v2-web","x-ca-progress-user-id":clean(local.user_id,128),"content-type":"application/json"},body:JSON.stringify({subscriptionId,action:mapped,targetPlanId:body?.targetPlanId,requestId:p3request})}),env as never);
        result=await response.json().catch(()=>({status:response.status}));if(!response.ok)throw new Error(clean((result as {error?:unknown})?.error)||`Provider operation failed (${response.status}).`);
      }
    }
    await db.prepare("UPDATE billing_operation_requests SET state='completed',result_json=?1,completed_at=?2 WHERE request_key=?3").bind(JSON.stringify(result),now(),requestId).run();
    await audit(db,{actorId,actorRole,action:`billing.operation.${action}`,targetType:caseId?"billing_reconciliation_case":"razorpay_subscription",targetId:caseId||subscriptionId,reason,traceId:requestId,next:result,reversible:false});
    return json({ok:true,result});
  }catch(error){
    const message=error instanceof Error?error.message:"Billing operation failed.";
    await db.prepare("UPDATE billing_operation_requests SET state='failed',error_code=?1,completed_at=?2 WHERE request_key=?3").bind(message.slice(0,300),now(),requestId).run();
    return json({error:message},400);
  }
}

async function scheduleReconciliation(env:Env,triggerKind:"scheduled"|"admin"="scheduled"){
  const db=database(env),runId=uuid(),started=now();
  const rows=(await db.prepare(`SELECT * FROM razorpay_subscriptions WHERE status IN ('created','authenticated','active','pending','halted','paused')
    AND (last_reconciled_at IS NULL OR last_reconciled_at<datetime('now','-2 hours') OR financial_state IN ('mismatch','failed','disputed'))
    ORDER BY CASE financial_state WHEN 'mismatch' THEN 0 WHEN 'disputed' THEN 1 WHEN 'failed' THEN 2 ELSE 3 END,COALESCE(last_reconciled_at,created_at) ASC LIMIT 75`).all<Row>()).results??[];
  await db.prepare("INSERT INTO billing_reconciliation_runs(id,trigger_kind,state,scanned_count,started_at) VALUES(?1,?2,'running',?3,?4)").bind(runId,triggerKind,rows.length,started).run();
  let queued=0,errors=0;
  for(const row of rows){
    const stale=!row.last_reconciled_at||Date.parse(clean(row.last_reconciled_at))<Date.now()-6*3600000;
    if(stale)await openCase(db,row,"stale_provider_reconciliation","warning",{max_age_hours:6},{last_reconciled_at:row.last_reconciled_at??null});
    const financial=clean(row.financial_state,40);if(["mismatch","failed","disputed"].includes(financial))await openCase(db,row,`financial_${financial}`,financial==="mismatch"||financial==="disputed"?"critical":"warning",{financial_state:"paid"},{financial_state:financial});
    try{
      const job:BillingJob={kind:"reconcile",subscriptionId:clean(row.provider_subscription_id,100),userId:clean(row.user_id,128),reason:triggerKind,runId};
      if(env.BILLING_OPS_QUEUE)await env.BILLING_OPS_QUEUE.send(job);else await performSync(env,job as Extract<BillingJob,{kind:"reconcile"}>);
      queued++;
    }catch{errors++;}
  }
  await db.prepare("UPDATE billing_reconciliation_runs SET queued_count=?1,error_count=error_count+?2,state=?3,completed_at=?4 WHERE id=?5")
    .bind(queued,errors,errors?"partial":"completed",now(),runId).run();
  return{runId,scanned:rows.length,queued,errors};
}

const worker={
  async fetch(request:Request,env:Env){
    const url=new URL(request.url);
    if(request.method==="POST"&&url.pathname==="/webhook")return queueWebhook(request,env);
    if(request.method==="POST"&&url.pathname==="/admin/action")return adminAction(request,env);
    if(request.method==="POST"&&url.pathname==="/admin/reconcile"){
      const actorRole=clean(request.headers.get("x-ca-progress-actor-role"),32);if(!ownerRole(actorRole))return json({error:"Owner billing authority is required."},403);
      return json(await scheduleReconciliation(env,"admin"));
    }
    return p3Worker.fetch(request,env as never);
  },
  async queue(batch:QueueBatch<BillingJob>,env:Env){
    for(const message of batch.messages){
      try{
        if(message.body.kind==="webhook"){
          const job=message.body;
          const headers=new Headers({"x-ca-progress-internal":"ca-progress-v2-web","x-razorpay-signature":job.signature,"content-type":"application/json"});
          if(job.eventId)headers.set("x-razorpay-event-id",job.eventId);
          const response=await p3Worker.fetch(new Request("https://billing.internal/webhook",{method:"POST",headers,body:job.raw}),env as never);
          if(!response.ok)throw new Error(`webhook_replay_${response.status}`);
        }else await performSync(env,message.body);
        message.ack();
      }catch{message.retry();}
    }
  },
  async scheduled(_controller:ScheduledController,env:Env){await scheduleReconciliation(env,"scheduled");}
};
export default worker;