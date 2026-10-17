import type { AppRole } from "../../lib/authorization/roles";
import previous from "./p4-closure";
import { ensurePlan } from "./p3";
import { hasAdminCapability } from "../../lib/authorization/capabilities.mjs";
type Env = Parameters<typeof previous.fetch>[1] & Parameters<typeof ensurePlan>[0];
type Row = Record<string, unknown>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers:{"content-type":"application/json","cache-control":"private, no-store"}});
async function validatePolicy(request: Request, env: Env) {
  const actor=request.headers.get("x-ca-progress-user-id"), role=request.headers.get("x-ca-progress-actor-role");
  if(request.headers.get("x-ca-progress-internal")!=="ca-progress-v2-web" || !actor || !role || !["parent_owner","owner","admin"].includes(role) || !hasAdminCapability(role as AppRole,"billing.plan.configure")) return json({error:"Plan configuration authority is required."},403);
  const input=await request.json() as {policyId?:string;reason?:string};
  if(!input.policyId || String(input.reason??"").trim().length<8) return json({error:"Policy and an audit reason are required."},400);
  if(!env.DB) return json({error:"Billing database is unavailable."},503);
  const row=await env.DB.prepare("SELECT pv.*,sp.tier_key,sp.billing_cycle FROM plan_policy_versions pv JOIN subscription_plans sp ON sp.id=pv.plan_id WHERE pv.id=?1").bind(input.policyId).first<Row>();
  if(!row || row.tier_key==="free") return json({error:"Choose a paid policy."},400);
  const cycle=String(row.billing_cycle),unit=String(row.billing_duration_unit),price=Number(row.price_subunits),duration=Number(row.billing_duration_value);
  if(!["monthly","annual"].includes(cycle) || unit!==(cycle==="monthly"?"month":"year") || !Number.isSafeInteger(price) || price<100 || !Number.isSafeInteger(duration) || duration<1 || row.currency!=="INR") return json({error:"Policy needs valid INR recurring terms."},409);
  const mapping=await ensurePlan(env,{planId:String(row.plan_id),tierKey:String(row.tier_key),billingCycle:cycle as "monthly"|"annual",name:String(row.name),policyVersionId:String(row.id),recurringPrice:price,currency:"INR",durationValue:duration,durationUnit:unit as "month"|"year",trialDays:Number(row.trial_days),graceDays:Number(row.grace_days),introPrice:null,introCycles:0,introProviderOfferId:null,introOfferVerified:false,cancellationMode:"period_end"},"recurring",price);
  await env.DB.prepare("INSERT INTO admin_audit_events(id,actor_user_id,actor_role,capability,action,target_type,target_id,reason,previous_value,new_value,trace_id,reversible,created_at) VALUES(?1,?2,?3,'billing.plan.configure','plan.policy.provider.validate','plan_policy_version',?4,?5,NULL,?6,?7,0,?8)").bind(crypto.randomUUID(),actor,role,row.id,input.reason,JSON.stringify({providerPlanId:mapping.providerPlanId,amount:price,currency:"INR"}),crypto.randomUUID(),new Date().toISOString()).run();
  return json({ok:true,policyVersionId:row.id,providerPlanId:mapping.providerPlanId});
}
const worker = {...previous, async fetch(request:Request,env:Env) {
  if(request.method==="POST" && new URL(request.url).pathname==="/admin/validate-policy") {
    try{return await validatePolicy(request,env);}catch(error){return json({error:error instanceof Error?error.message:"Provider validation failed."},409);}
  }
  return previous.fetch(request,env);
}};
export default worker;
