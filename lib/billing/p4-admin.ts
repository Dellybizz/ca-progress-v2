import "server-only";

import type { AppRole } from "@/lib/authorization/roles";
import { invalidateUserFeatureCache } from "@/lib/cache/public";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";

type Row = Record<string, unknown>;
export type BillingOpsFilters = { query?: string; state?: string; planId?: string; dateFrom?: string; dateTo?: string; mismatchOnly?: boolean };
export type CampaignDraftInput = {
  campaignId?: string; campaignKey: string; name: string; description?: string; campaignType: "discount"|"intro"|"free_access"|"reward";
  discountKind?: "none"|"fixed"|"percentage"; discountValue?: number; providerOfferId?: string|null; promoCode?: string|null;
  targetPlanId?: string|null; attemptKey?: string|null; startsAt: string; endsAt: string; claimStartsAt: string; claimEndsAt: string;
  maxRedemptions?: number|null; perUserLimit?: number; firstNLimit?: number|null; freeAccessDays?: number; discountCycles?: number;
  requireAllowlist?: boolean; priority?: number; changeReason: string;
};

const db=()=>getD1RuntimeDatabase();
const text=(v:unknown)=>typeof v==="string"?v:"";
const num=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
const clean=(v:string|undefined,max=160)=>(v??"").trim().slice(0,max);
const like=(v:string)=>`%${v.replaceAll("\\","\\\\").replaceAll("%","\\%").replaceAll("_","\\_")}%`;
const day=(value:string|undefined,end=false)=>{const normalized=clean(value,10);return /^\d{4}-\d{2}-\d{2}$/.test(normalized)?`${normalized}T${end?"23:59:59.999":"00:00:00.000"}Z`:"";};

export async function getBillingOperations(input:BillingOpsFilters={}){
  const q=clean(input.query),pattern=like(q),state=clean(input.state,40),planId=clean(input.planId,100),dateFrom=day(input.dateFrom),dateTo=day(input.dateTo,true);
  const where:string[]=["1=1"];const params:unknown[]=[];
  if(state){params.push(state);where.push(`rs.status=?${params.length}`);}
  if(planId){params.push(planId);where.push(`rs.plan_id=?${params.length}`);}
  if(dateFrom){params.push(dateFrom);where.push(`COALESCE(rs.last_reconciled_at,rs.updated_at,rs.created_at)>=?${params.length}`);}
  if(dateTo){params.push(dateTo);where.push(`COALESCE(rs.last_reconciled_at,rs.updated_at,rs.created_at)<=?${params.length}`);}
  if(input.mismatchOnly)where.push(`(rs.financial_state='mismatch' OR EXISTS(SELECT 1 FROM billing_reconciliation_cases bc WHERE bc.razorpay_subscription_id=rs.id AND bc.state<>'resolved'))`);
  if(q){params.push(pattern);const i=params.length;where.push(`(
    rs.user_id LIKE ?${i} ESCAPE '\\' OR rs.provider_subscription_id LIKE ?${i} ESCAPE '\\'
    OR EXISTS(SELECT 1 FROM auth_identities ai WHERE ai.application_user_id=rs.user_id AND COALESCE(ai.email,'') LIKE ?${i} ESCAPE '\\')
    OR EXISTS(SELECT 1 FROM razorpay_subscription_charges ch WHERE ch.razorpay_subscription_id=rs.id AND ch.provider_payment_id LIKE ?${i} ESCAPE '\\')
    OR EXISTS(SELECT 1 FROM payment_orders po WHERE po.user_id=rs.user_id AND (po.provider_order_id LIKE ?${i} ESCAPE '\\' OR COALESCE(po.provider_payment_id,'') LIKE ?${i} ESCAPE '\\'))
  )`);}
  const statement=db().prepare(`SELECT rs.*,sp.name plan_name,
    (SELECT ai.email FROM auth_identities ai WHERE ai.application_user_id=rs.user_id ORDER BY COALESCE(ai.last_seen_at,ai.updated_at) DESC LIMIT 1) email
    FROM razorpay_subscriptions rs JOIN subscription_plans sp ON sp.id=rs.plan_id WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(rs.last_reconciled_at,rs.updated_at) DESC LIMIT 100`);
  const subs=(params.length?await statement.bind(...params).all<Row>():await statement.all<Row>()).results??[];
  const userIds=[...new Set(subs.map(row=>text(row.user_id)).filter(Boolean))].slice(0,100);
  const ids=[...new Set(subs.map(row=>text(row.id)).filter(Boolean))].slice(0,100);
  const providerIds=[...new Set(subs.map(row=>text(row.provider_subscription_id)).filter(Boolean))].slice(0,100);
  const ph=(values:string[])=>values.map((_,index)=>`?${index+1}`).join(",");
  const [cases,alerts,runs,campaigns,orders,charges,access,events,audits]=await Promise.all([
    db().prepare(`SELECT * FROM billing_reconciliation_cases WHERE state<>'resolved' ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,last_seen_at DESC LIMIT 100`).all<Row>(),
    db().prepare(`SELECT * FROM billing_operational_alerts WHERE state<>'resolved' ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,updated_at DESC LIMIT 80`).all<Row>(),
    db().prepare(`SELECT * FROM billing_reconciliation_runs ORDER BY started_at DESC LIMIT 30`).all<Row>(),
    db().prepare(`SELECT c.id,c.campaign_key,c.name,c.description,c.active,cv.*,
      (SELECT COUNT(*) FROM billing_campaign_claims cc WHERE cc.campaign_version_id=cv.id AND cc.state='applied') applied_claims,
      (SELECT COALESCE(SUM(cc.base_price_subunits-cc.final_price_subunits),0) FROM billing_campaign_claims cc WHERE cc.campaign_version_id=cv.id AND cc.state='applied') liability_subunits
      FROM billing_campaigns c LEFT JOIN billing_campaign_versions cv ON cv.id=(SELECT v.id FROM billing_campaign_versions v WHERE v.campaign_id=c.id ORDER BY v.version DESC LIMIT 1)
      ORDER BY c.updated_at DESC LIMIT 100`).all<Row>(),
    userIds.length?db().prepare(`SELECT po.*,sp.name plan_name FROM payment_orders po JOIN subscription_plans sp ON sp.id=po.plan_id WHERE po.user_id IN (${ph(userIds)}) ORDER BY po.created_at DESC LIMIT 120`).bind(...userIds).all<Row>():Promise.resolve({results:[]} as {results:Row[]}),
    ids.length?db().prepare(`SELECT ch.*,rs.user_id FROM razorpay_subscription_charges ch JOIN razorpay_subscriptions rs ON rs.id=ch.razorpay_subscription_id WHERE ch.razorpay_subscription_id IN (${ph(ids)}) ORDER BY COALESCE(ch.captured_at,ch.provider_created_at,ch.updated_at) DESC LIMIT 120`).bind(...ids).all<Row>():Promise.resolve({results:[]} as {results:Row[]}),
    providerIds.length?db().prepare(`SELECT us.*,sp.name plan_name FROM user_subscriptions us JOIN subscription_plans sp ON sp.id=us.plan_id WHERE us.provider_subscription_id IN (${ph(providerIds)}) ORDER BY us.updated_at DESC LIMIT 120`).bind(...providerIds).all<Row>():Promise.resolve({results:[]} as {results:Row[]}),
    ids.length?db().prepare(`SELECT e.*,rs.user_id FROM razorpay_subscription_events e JOIN razorpay_subscriptions rs ON rs.id=e.razorpay_subscription_id WHERE e.razorpay_subscription_id IN (${ph(ids)}) ORDER BY e.received_at DESC LIMIT 150`).bind(...ids).all<Row>():Promise.resolve({results:[]} as {results:Row[]}),
    db().prepare(`SELECT id,actor_user_id,action,target_type,target_id,reason,new_value,trace_id,created_at FROM admin_audit_events WHERE capability='billing.manage' ORDER BY created_at DESC LIMIT 80`).all<Row>(),
  ]);
  const metrics=await db().prepare(`SELECT
    (SELECT COUNT(*) FROM razorpay_subscriptions WHERE status IN ('created','authenticated','active','pending','halted','paused')) open_subscriptions,
    (SELECT COUNT(*) FROM razorpay_subscriptions WHERE financial_state IN ('mismatch','failed','disputed')) financial_attention,
    (SELECT COUNT(*) FROM billing_reconciliation_cases WHERE state<>'resolved') open_cases,
    (SELECT COUNT(*) FROM billing_operational_alerts WHERE state<>'resolved' AND severity='critical') critical_alerts,
    (SELECT COUNT(*) FROM billing_campaign_claims WHERE state='applied') campaign_redemptions,
    (SELECT COALESCE(SUM(base_price_subunits-final_price_subunits),0) FROM billing_campaign_claims WHERE state='applied') campaign_liability`).first<Row>();
  const timeline=[
    ...(orders.results??[]).map(row=>({kind:"order",at:text(row.paid_at)||text(row.created_at),userId:text(row.user_id),id:text(row.provider_order_id),status:text(row.status),detail:`${text(row.currency)} ${(num(row.amount_subunits)/100).toFixed(2)} · ${text(row.plan_name)}`})),
    ...(charges.results??[]).map(row=>({kind:"charge",at:text(row.captured_at)||text(row.provider_created_at)||text(row.updated_at),userId:text(row.user_id),id:text(row.provider_payment_id),status:text(row.status),detail:`${text(row.currency)} ${(num(row.amount_subunits)/100).toFixed(2)} · refund ${text(row.refund_state)||"none"} · dispute ${text(row.dispute_state)||"none"}`})),
    ...(events.results??[]).map(row=>({kind:"webhook",at:text(row.processed_at)||text(row.received_at),userId:text(row.user_id),id:text(row.provider_event_id),status:text(row.outcome),detail:text(row.event_type),evidence:text(row.evidence_json)})),
    ...(access.results??[]).map(row=>({kind:"access",at:text(row.updated_at)||text(row.created_at),userId:text(row.user_id),id:text(row.id),status:text(row.status),detail:`${text(row.plan_name)} · ${text(row.source)} · ends ${text(row.ends_at)||"open"}`})),
    ...(audits.results??[]).map(row=>({kind:"audit",at:text(row.created_at),userId:text(row.actor_user_id),id:text(row.id),status:text(row.action),detail:`${text(row.target_type)} ${text(row.target_id)} · ${text(row.reason)}`,evidence:text(row.new_value)})),
  ].filter(item=>item.at).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,180);
  return {filters:{query:q,state,planId,dateFrom:clean(input.dateFrom,10),dateTo:clean(input.dateTo,10),mismatchOnly:Boolean(input.mismatchOnly)},metrics,subscriptions:subs,cases:cases.results??[],alerts:alerts.results??[],runs:runs.results??[],campaigns:campaigns.results??[],orders:orders.results??[],charges:charges.results??[],access:access.results??[],events:events.results??[],audits:audits.results??[],timeline};
}

async function appendAudit(input:{actorUserId:string;actorRole:AppRole;action:string;targetType:string;targetId:string|null;reason:string;previousValue?:unknown;newValue?:unknown;traceId:string;reversible?:boolean}){
  await db().prepare(`INSERT INTO admin_audit_events(id,actor_user_id,actor_role,capability,action,target_type,target_id,reason,previous_value,new_value,trace_id,reversible,created_at)
    VALUES(?1,?2,?3,'billing.manage',?4,?5,?6,?7,?8,?9,?10,?11,?12)`)
    .bind(crypto.randomUUID(),input.actorUserId,input.actorRole,input.action,input.targetType,input.targetId,input.reason,
      input.previousValue===undefined?null:JSON.stringify(input.previousValue),input.newValue===undefined?null:JSON.stringify(input.newValue),
      input.traceId,input.reversible?1:0,new Date().toISOString()).run();
}

export async function createCampaignDraft(input:CampaignDraftInput,actor:{userId:string;role:AppRole;traceId:string}){
  if(actor.role!=="owner"&&actor.role!=="parent_owner")throw new Error("Campaign management requires an Owner or Parent Owner.");
  const reason=clean(input.changeReason,1000);if(reason.length<3)throw new Error("A change reason is required.");
  const key=clean(input.campaignKey,80).toLowerCase().replace(/[^a-z0-9_-]/g,"-");if(key.length<3)throw new Error("Campaign key is invalid.");
  const nowIso=new Date().toISOString(),campaignId=input.campaignId||crypto.randomUUID();
  const existing=await db().prepare("SELECT * FROM billing_campaigns WHERE id=?1 OR campaign_key=?2 LIMIT 1").bind(campaignId,key).first<Row>();
  const id=existing?text(existing.id):campaignId;
  const max=await db().prepare("SELECT COALESCE(MAX(version),0) v FROM billing_campaign_versions WHERE campaign_id=?1").bind(id).first<{v:number}>();
  const version=num(max?.v)+1,versionId=crypto.randomUUID();
  await db().batch([
    db().prepare(`INSERT INTO billing_campaigns(id,campaign_key,name,description,active,created_by,created_at,updated_at)
      VALUES(?1,?2,?3,?4,1,?5,?6,?6) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,updated_at=excluded.updated_at`)
      .bind(id,key,clean(input.name,140),clean(input.description,1000),actor.userId,nowIso),
    db().prepare(`INSERT INTO billing_campaign_versions(id,campaign_id,version,state,campaign_type,discount_kind,discount_value,provider_offer_id,promo_code,target_plan_id,attempt_key,starts_at,ends_at,claim_starts_at,claim_ends_at,max_redemptions,per_user_limit,first_n_limit,free_access_days,discount_cycles,require_allowlist,priority,change_reason,created_by)
      VALUES(?1,?2,?3,'draft',?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)`)
      .bind(versionId,id,version,input.campaignType,input.discountKind??"none",Math.max(0,Math.floor(input.discountValue??0)),clean(input.providerOfferId??undefined,100)||null,
        clean(input.promoCode??undefined,80)||null,input.targetPlanId||null,input.attemptKey||null,input.startsAt,input.endsAt,input.claimStartsAt,input.claimEndsAt,
        input.maxRedemptions??null,Math.max(1,Math.floor(input.perUserLimit??1)),input.firstNLimit??null,Math.max(0,Math.floor(input.freeAccessDays??0)),
        Math.max(1,Math.floor(input.discountCycles??1)),input.requireAllowlist?1:0,Math.floor(input.priority??100),reason,actor.userId),
  ]);
  await appendAudit({actorUserId:actor.userId,actorRole:actor.role,action:"billing.campaign.draft.create",targetType:"billing_campaign_version",targetId:versionId,reason,newValue:{campaignId:id,version},traceId:actor.traceId,reversible:true});
  return {campaignId:id,versionId,version};
}

export async function publishCampaign(versionId:string,actor:{userId:string;role:AppRole;traceId:string},reason:string){
  if(actor.role!=="owner"&&actor.role!=="parent_owner")throw new Error("Campaign publishing requires an Owner or Parent Owner.");
  const current=await db().prepare("SELECT cv.*,c.active FROM billing_campaign_versions cv JOIN billing_campaigns c ON c.id=cv.campaign_id WHERE cv.id=?1 LIMIT 1").bind(versionId).first<Row>();
  if(!current)throw new Error("Campaign version not found.");if(text(current.state)!=="draft")throw new Error("Only draft campaign versions can be published.");
  const why=clean(reason,1000);if(why.length<3)throw new Error("A publish reason is required.");
  const type=text(current.campaign_type),kind=text(current.discount_kind),value=num(current.discount_value),providerOffer=text(current.provider_offer_id),targetPlan=text(current.target_plan_id),freeDays=num(current.free_access_days);
  if(["discount","intro"].includes(type)){
    if(!["fixed","percentage"].includes(kind)||value<=0)throw new Error("Paid discount campaigns require a positive fixed or percentage discount rule.");
    if(!providerOffer)throw new Error("Paid discount campaigns require an approved Razorpay offer ID.");
    if(!targetPlan)throw new Error("Paid discount campaigns require a target plan.");
  }else if(["free_access","reward"].includes(type)){
    if(kind!=="none"||value!==0||providerOffer)throw new Error("Free access and reward campaigns cannot carry a Razorpay monetary discount.");
    if(!targetPlan||freeDays<1)throw new Error("Free access and reward campaigns require a target plan and at least one access day.");
  }
  const stamp=new Date().toISOString();
  await db().batch([
    db().prepare("UPDATE billing_campaign_versions SET state='retired',retired_at=?1 WHERE campaign_id=?2 AND state='published'").bind(stamp,current.campaign_id),
    db().prepare("UPDATE billing_campaign_versions SET state='published',published_at=?1 WHERE id=?2 AND state='draft'").bind(stamp,versionId),
  ]);
  await appendAudit({actorUserId:actor.userId,actorRole:actor.role,action:"billing.campaign.publish",targetType:"billing_campaign_version",targetId:versionId,reason:why,previousValue:{state:"draft"},newValue:{state:"published"},traceId:actor.traceId,reversible:true});
}

export async function setCampaignAllowlist(versionId:string,userId:string,allowed:boolean,actor:{userId:string;role:AppRole;traceId:string},reason:string){
  if(actor.role!=="owner"&&actor.role!=="parent_owner")throw new Error("Campaign allowlists require an Owner or Parent Owner.");
  const why=clean(reason,1000);if(why.length<3)throw new Error("A reason is required.");
  if(allowed)await db().prepare("INSERT OR IGNORE INTO billing_campaign_allowlist(campaign_version_id,user_id,added_by) VALUES(?1,?2,?3)").bind(versionId,userId,actor.userId).run();
  else await db().prepare("DELETE FROM billing_campaign_allowlist WHERE campaign_version_id=?1 AND user_id=?2").bind(versionId,userId).run();
  await appendAudit({actorUserId:actor.userId,actorRole:actor.role,action:allowed?"billing.campaign.allowlist.add":"billing.campaign.allowlist.remove",targetType:"billing_campaign_version",targetId:versionId,reason:why,newValue:{userId,allowed},traceId:actor.traceId,reversible:true});
}

export async function grantCampaignAccess(input:{versionId:string;userId:string;reason:string;requestId:string},actor:{userId:string;role:AppRole;traceId:string}){
  if(actor.role!=="owner"&&actor.role!=="parent_owner")throw new Error("Campaign grants require an Owner or Parent Owner.");
  const requestId=clean(input.requestId,100);if(!/^[A-Za-z0-9_-]{16,100}$/.test(requestId))throw new Error("A valid idempotency request ID is required.");
  const why=clean(input.reason,1000);if(why.length<8)throw new Error("Give a grant reason of at least 8 characters.");
  const claimKey=`admin_campaign_${requestId}`.slice(0,160);
  const prior=await db().prepare(`SELECT cc.id,cc.grant_subscription_id,cc.state,us.plan_id,us.ends_at FROM billing_campaign_claims cc LEFT JOIN user_subscriptions us ON us.id=cc.grant_subscription_id WHERE cc.claim_key=?1 LIMIT 1`).bind(claimKey).first<Row>();
  if(prior?.state==="applied"&&prior.grant_subscription_id)return{claimId:text(prior.id),subscriptionId:text(prior.grant_subscription_id),planId:text(prior.plan_id),endsAt:text(prior.ends_at),idempotent:true};
  if(prior)throw new Error("This grant request has already been attempted. Refresh before retrying.");
  const version=await db().prepare(`SELECT cv.*,c.active FROM billing_campaign_versions cv JOIN billing_campaigns c ON c.id=cv.campaign_id WHERE cv.id=?1 LIMIT 1`).bind(input.versionId).first<Row>();
  if(!version||text(version.state)!=="published"||num(version.active)!==1)throw new Error("Published campaign version not found.");
  if(!["free_access","reward"].includes(text(version.campaign_type)))throw new Error("This campaign requires Razorpay checkout rather than an administrative access grant.");
  const planId=text(version.target_plan_id);if(!planId)throw new Error("Free access and reward campaigns require a target plan.");
  const policy=await db().prepare(`SELECT id,price_subunits FROM plan_policy_versions WHERE plan_id=?1 AND state='published' AND (effective_at IS NULL OR effective_at<=?2) ORDER BY COALESCE(effective_at,published_at,created_at) DESC,version DESC LIMIT 1`).bind(planId,new Date().toISOString()).first<Row>();
  if(!policy)throw new Error("No published plan policy is available for this campaign.");
  const user=await db().prepare("SELECT user_id FROM app_users WHERE user_id=?1 LIMIT 1").bind(input.userId).first<Row>();if(!user)throw new Error("User was not found.");
  const days=Math.max(1,num(version.free_access_days)),claimId=crypto.randomUUID(),subscriptionId=crypto.randomUUID(),eventId=crypto.randomUUID(),adminGrantId=crypto.randomUUID(),stamp=new Date().toISOString(),endsAt=new Date(Date.parse(stamp)+days*86400000).toISOString();
  const rows=await db().batch([
    db().prepare(`INSERT INTO billing_campaign_claims(id,claim_key,campaign_version_id,user_id,plan_id,policy_version_id,provider_offer_id,base_price_subunits,campaign_adjustment_subunits,final_price_subunits,discount_cycles,state,metadata_json)
      VALUES(?1,?2,?3,?4,?5,?6,NULL,?7,?7,0,1,'reserved',?8)`).bind(claimId,claimKey,input.versionId,input.userId,planId,policy.id,num(policy.price_subunits),JSON.stringify({source:"admin_campaign_grant",days,admin_grant_id:adminGrantId})),
    db().prepare(`INSERT INTO user_subscriptions(id,user_id,plan_id,status,starts_at,ends_at,source,created_at,updated_at) VALUES(?1,?2,?3,'active',?4,?5,'manual',?4,?4)`).bind(subscriptionId,input.userId,planId,stamp,endsAt),
    db().prepare(`INSERT INTO subscription_policy_contracts(subscription_id,policy_version_id,grandfathered,decision_reason) VALUES(?1,?2,1,'P4 campaign grant')`).bind(subscriptionId,policy.id),
    db().prepare(`INSERT INTO admin_subscription_grants(id,subscription_id,user_id,plan_id,state,starts_at,ends_at,reason,created_by,idempotency_key,created_at,updated_at) VALUES(?1,?2,?3,?4,'active',?5,?6,?7,?8,?9,?5,?5)`).bind(adminGrantId,subscriptionId,input.userId,planId,stamp,endsAt,why,actor.userId,`campaign_${requestId}`),
    db().prepare(`INSERT INTO subscription_events(id,subscription_id,user_id,plan_id,payment_event_id,event_type,source,starts_at,ends_at,metadata,created_at)
      VALUES(?1,?2,?3,?4,NULL,'granted','campaign',?5,?6,?7,?5)`).bind(eventId,subscriptionId,input.userId,planId,stamp,endsAt,JSON.stringify({campaign_version_id:input.versionId,claim_id:claimId,admin_grant_id:adminGrantId})),
    db().prepare(`UPDATE billing_campaign_claims SET state='applied',grant_subscription_id=?1,applied_at=?2 WHERE id=?3 AND state='reserved'`).bind(subscriptionId,stamp,claimId),
  ]);
  if(rows.some(row=>row.success===false))throw new Error("Campaign access could not be granted atomically.");
  await appendAudit({actorUserId:actor.userId,actorRole:actor.role,action:"billing.campaign.access.grant",targetType:"billing_campaign_claim",targetId:claimId,reason:why,newValue:{userId:input.userId,planId,endsAt,campaignVersionId:input.versionId,adminGrantId,paymentCreated:false},traceId:actor.traceId,reversible:true});
  await invalidateUserFeatureCache(input.userId);
  return{claimId,subscriptionId,planId,endsAt,idempotent:false};
}

export async function retireCampaign(versionId:string,actor:{userId:string;role:AppRole;traceId:string},reason:string){
  if(actor.role!=="owner"&&actor.role!=="parent_owner")throw new Error("Campaign retirement requires an Owner or Parent Owner.");
  const current=await db().prepare("SELECT id,state,campaign_id FROM billing_campaign_versions WHERE id=?1 LIMIT 1").bind(versionId).first<Row>();
  if(!current)throw new Error("Campaign version not found.");if(text(current.state)==="retired")return;
  const why=clean(reason,1000);if(why.length<3)throw new Error("A retirement reason is required.");
  const stamp=new Date().toISOString();
  await db().prepare("UPDATE billing_campaign_versions SET state='retired',retired_at=?1 WHERE id=?2").bind(stamp,versionId).run();
  await appendAudit({actorUserId:actor.userId,actorRole:actor.role,action:"billing.campaign.retire",targetType:"billing_campaign_version",targetId:versionId,reason:why,previousValue:{state:current.state},newValue:{state:"retired"},traceId:actor.traceId,reversible:true});
}
