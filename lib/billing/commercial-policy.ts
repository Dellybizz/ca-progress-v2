import "server-only";
import { optionalUser } from "@/lib/auth/server";
import type { AppRole } from "@/lib/authorization/roles";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import type { PlanEntitlement } from "./service";

type Actor={userId:string;role:AppRole};
type Row=Record<string,unknown>;
const db=()=>getD1RuntimeDatabase();
const asRows=<T>(value:{results?:T[]}):T[]=>value.results??[];

export type PublishedPricingOffer={
  planId:string;
  tierKey:string;
  billingCycle:string;
  policyVersionId:string;
  recurringPriceSubunits:number;
  todayPriceSubunits:number;
  currency:string;
  trialDays:number;
  graceDays:number;
  effectiveAt:string|null;
  introPriceSubunits:number|null;
  introBillingCycles:number;
  introRemainingCycles:number;
  introEligible:boolean;
  cancellationMode:"period_end"|"immediate_if_unpaid";
  termsNote:string;
  checkoutReady:boolean;
};

const activePolicySql=`pv.state='published' AND (pv.effective_at IS NULL OR pv.effective_at<=?1) AND pv.id=(
  SELECT candidate.id FROM plan_policy_versions candidate
  WHERE candidate.plan_id=pv.plan_id AND candidate.state='published' AND (candidate.effective_at IS NULL OR candidate.effective_at<=?1)
  ORDER BY COALESCE(candidate.effective_at,candidate.published_at,candidate.created_at) DESC,candidate.version DESC LIMIT 1
)`;

export async function listPublishedPricingOffers():Promise<PublishedPricingOffer[]>{
  const database=db(),now=new Date().toISOString(),identity=await optionalUser();
  const [offersResult,paidResult]=await Promise.all([
    database.prepare(`SELECT sp.id plan_id,sp.tier_key,sp.billing_cycle,pv.id policy_version_id,pv.price_subunits recurring_price_subunits,pv.currency,pv.trial_days,pv.grace_days,pv.effective_at,ot.intro_price_subunits,COALESCE(ot.intro_billing_cycles,0) intro_billing_cycles,COALESCE(ot.cancellation_mode,'period_end') cancellation_mode,COALESCE(ot.terms_note,'') terms_note
      FROM subscription_plans sp JOIN plan_policy_versions pv ON pv.plan_id=sp.id LEFT JOIN plan_policy_offer_terms ot ON ot.policy_version_id=pv.id
      WHERE sp.active=1 AND ${activePolicySql} ORDER BY sp.sort_order`).bind(now).all<Row>(),
    identity?database.prepare(`SELECT sp.tier_key,COUNT(*) paid_count FROM payment_orders po JOIN subscription_plans sp ON sp.id=po.plan_id WHERE po.user_id=?1 AND po.status='paid' GROUP BY sp.tier_key`).bind(identity.id).all<Row>():Promise.resolve({results:[]} as {results:Row[]}),
  ]);
  const paidByTier=new Map(asRows(paidResult).map(row=>[String(row.tier_key),Number(row.paid_count??0)]));
  return asRows(offersResult).map(row=>{
    const tierKey=String(row.tier_key),recurring=Number(row.recurring_price_subunits??0),trialDays=Number(row.trial_days??0),intro=row.intro_price_subunits==null?null:Number(row.intro_price_subunits),introCycles=Number(row.intro_billing_cycles??0),paidCount=paidByTier.get(tierKey)??0;
    const introRemaining=Math.max(0,introCycles-paidCount),introEligible=intro!==null&&introRemaining>0;
    const today=trialDays>0?0:introEligible?Number(intro):recurring;
    return{planId:String(row.plan_id),tierKey,billingCycle:String(row.billing_cycle),policyVersionId:String(row.policy_version_id),recurringPriceSubunits:recurring,todayPriceSubunits:today,currency:String(row.currency),trialDays,graceDays:Number(row.grace_days??0),effectiveAt:row.effective_at?String(row.effective_at):null,introPriceSubunits:intro,introBillingCycles:introCycles,introRemainingCycles:introRemaining,introEligible,cancellationMode:String(row.cancellation_mode)==="immediate_if_unpaid"?"immediate_if_unpaid":"period_end",termsNote:String(row.terms_note??""),checkoutReady:tierKey==="free"||(trialDays===0&&recurring>=100&&today>=100)};
  });
}

export async function listActivePlanEntitlements():Promise<PlanEntitlement[]>{
  const now=new Date().toISOString();
  const result=await db().prepare(`SELECT pv.plan_id,f.feature_key,f.enabled,COALESCE(f.quantity_limit,f.time_limit_minutes,CASE WHEN f.storage_limit_bytes IS NULL THEN NULL ELSE f.storage_limit_bytes/1048576.0 END) limit_value,CASE WHEN f.storage_limit_bytes IS NOT NULL THEN 'megabytes' WHEN f.time_limit_minutes IS NOT NULL THEN 'minutes' WHEN f.quantity_limit IS NOT NULL THEN 'count' ELSE 'unlimited' END limit_unit,CASE WHEN f.reset_period='lifetime' THEN 'never' ELSE f.reset_period END reset_period,f.upgrade_message
    FROM plan_policy_versions pv JOIN plan_policy_features f ON f.policy_version_id=pv.id JOIN plan_policy_pages pg ON pg.policy_version_id=f.policy_version_id AND pg.page_key=f.page_key AND pg.enabled=1
    WHERE ${activePolicySql} ORDER BY pv.plan_id,f.feature_key`).bind(now).all<Row>();
  return asRows(result).map(row=>({plan_id:String(row.plan_id),feature_key:String(row.feature_key),enabled:Boolean(row.enabled),limit_value:row.limit_value==null?null:Number(row.limit_value),limit_unit:String(row.limit_unit),reset_period:String(row.reset_period),upgrade_message:String(row.upgrade_message)}));
}

export async function getCommercialPolicyAdminData(){
  const database=db(),nowIso=new Date().toISOString();
  const [terms,contracts,scheduled]=await Promise.all([
    database.prepare("SELECT * FROM plan_policy_offer_terms ORDER BY updated_at DESC").all<Row>(),
    database.prepare("SELECT policy_version_id,COUNT(*) contract_count FROM subscription_policy_contracts GROUP BY policy_version_id").all<Row>(),
    database.prepare(`SELECT sc.*,sp.name to_plan_name,sp.billing_cycle to_billing_cycle FROM scheduled_plan_changes sc JOIN subscription_plans sp ON sp.id=sc.to_plan_id ORDER BY sc.effective_at DESC LIMIT 100`).all<Row>(),
  ]);
  return{nowIso,offerTerms:asRows(terms),contractCounts:asRows(contracts),scheduledChanges:asRows(scheduled)};
}

const clean=(value:unknown,limit:number)=>String(value??"").trim().slice(0,limit);
export async function savePolicyOfferTerms(input:{policyId:string;introPriceRupees:unknown;introBillingCycles:unknown;cancellationMode:string;termsNote:string;reason:string;actor:Actor}){
  const database=db(),policyId=clean(input.policyId,120),reason=clean(input.reason,1000);if(!policyId)throw new Error("Policy is required.");if(reason.length<8)throw new Error("A reason of at least 8 characters is required.");
  const policy=await database.prepare("SELECT id,state,price_subunits FROM plan_policy_versions WHERE id=?1 LIMIT 1").bind(policyId).first<Row>();if(policy?.state!=="draft")throw new Error("Only a draft policy can be edited.");
  const rawIntro=String(input.introPriceRupees??"").trim(),introPrice=rawIntro===""?null:Math.round(Number(rawIntro)*100),cycles=rawIntro===""?0:Number(input.introBillingCycles??0),cancellation=input.cancellationMode==="immediate_if_unpaid"?"immediate_if_unpaid":"period_end",note=clean(input.termsNote,500);
  if(introPrice!==null&&(!Number.isInteger(introPrice)||introPrice<100))throw new Error("Introductory price must be at least ₹1.");if(introPrice!==null&&(!Number.isInteger(cycles)||cycles<1||cycles>24))throw new Error("Introductory billing cycles must be between 1 and 24.");if(introPrice!==null&&introPrice>Number(policy.price_subunits??0))throw new Error("Introductory price cannot exceed the recurring price.");
  const previous=await database.prepare("SELECT * FROM plan_policy_offer_terms WHERE policy_version_id=?1").bind(policyId).first<Row>();const now=new Date().toISOString();
  const next={introPriceSubunits:introPrice,introBillingCycles:cycles,cancellationMode:cancellation,termsNote:note};
  const rows=await database.batch([
    database.prepare(`INSERT INTO plan_policy_offer_terms(policy_version_id,intro_price_subunits,intro_billing_cycles,cancellation_mode,terms_note,updated_by,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(policy_version_id) DO UPDATE SET intro_price_subunits=excluded.intro_price_subunits,intro_billing_cycles=excluded.intro_billing_cycles,cancellation_mode=excluded.cancellation_mode,terms_note=excluded.terms_note,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(policyId,introPrice,cycles,cancellation,note,input.actor.userId,now),
    database.prepare(`INSERT INTO admin_audit_events(id,actor_user_id,actor_role,capability,action,target_type,target_id,reason,previous_value,new_value,trace_id,reversible,created_at) VALUES(?1,?2,?3,'billing.plan.configure','plan.policy.offer_terms.save','plan_policy_version',?4,?5,?6,?7,?8,1,?9)`).bind(crypto.randomUUID(),input.actor.userId,input.actor.role,policyId,reason,JSON.stringify(previous),JSON.stringify(next),crypto.randomUUID(),now),
  ]);if(rows.some(row=>row.success===false))throw new Error("Offer terms could not be saved atomically.");
}
