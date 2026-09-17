import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const text=(v)=>String(v??"").trim();
const num=(v)=>Number(v??0);
const fp=(v)=>createHash("sha256").update(text(v)).digest("hex").slice(0,12);
const required=(name)=>{const v=text(process.env[name]);if(!v)throw new Error(name+" is required.");return v;};

function parseDatabaseConfig(configText){
  const name=configText.match(/"database_name"\s*:\s*"([^"]+)"/)?.[1];
  const id=configText.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
  if(!name||!id)throw new Error("Could not resolve Billing Worker D1 configuration.");
  return {name,id};
}

export const mappingSql="SELECT rpm.id,rpm.policy_version_id,rpm.internal_plan_id,rpm.price_kind,rpm.period,rpm.interval_value,rpm.amount_subunits,rpm.currency,rpm.state,rpm.provider_plan_id,rpm.last_error,rpm.last_checked_at,pv.price_subunits AS policy_recurring_price_subunits,pv.currency AS policy_currency,pv.billing_duration_value,pv.billing_duration_unit,ot.intro_price_subunits,COALESCE(ot.intro_billing_cycles,0) AS intro_billing_cycles FROM razorpay_plan_mappings rpm JOIN plan_policy_versions pv ON pv.id=rpm.policy_version_id LEFT JOIN plan_policy_offer_terms ot ON ot.policy_version_id=pv.id ORDER BY rpm.policy_version_id,rpm.price_kind,rpm.created_at ASC LIMIT 5000";
export const subscriptionPlanSql="SELECT rs.id,rs.user_id,rs.plan_id,rs.policy_version_id,rs.provider_subscription_id,rs.provider_plan_id,rs.recurring_provider_plan_id,rs.provider_offer_id,rs.status,rs.financial_state,rs.initial_price_subunits,rs.recurring_price_subunits,rs.intro_billing_cycles,rs.intro_remaining_cycles,rs.total_count,rs.paid_count,rs.auth_attempts,rs.created_at FROM razorpay_subscriptions rs ORDER BY rs.created_at ASC LIMIT 5000";
export const campaignSql="SELECT cv.id,cv.campaign_id,cv.state,cv.campaign_type,cv.discount_kind,cv.discount_value,cv.provider_offer_id,cv.discount_cycles,cv.target_plan_id,cv.starts_at,cv.ends_at,cv.claim_starts_at,cv.claim_ends_at,cv.promo_code,(SELECT COUNT(*) FROM billing_campaign_claims cc WHERE cc.campaign_version_id=cv.id) AS claim_count,(SELECT COUNT(*) FROM billing_campaign_claims cc WHERE cc.campaign_version_id=cv.id AND cc.state='applied') AS applied_claim_count FROM billing_campaign_versions cv WHERE cv.provider_offer_id IS NOT NULL ORDER BY cv.created_at ASC LIMIT 5000";

async function fetchJson(url,init,label){
  let lastError;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const response=await fetch(url,init);
      const raw=await response.text();
      const data=raw?JSON.parse(raw):null;
      if(!response.ok)throw new Error(label+" failed: "+(data?.error?.description||data?.errors?.[0]?.message||(response.status+" "+response.statusText)));
      return data;
    }catch(error){
      lastError=error;
      if(attempt<3)await new Promise(r=>setTimeout(r,attempt*500));
    }
  }
  throw lastError;
}

async function queryD1(accountId,apiToken,databaseId,sql){
  const data=await fetchJson("https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(accountId)+"/d1/database/"+encodeURIComponent(databaseId)+"/query",{
    method:"POST",
    headers:{authorization:"Bearer "+apiToken,"content-type":"application/json",accept:"application/json"},
    body:JSON.stringify({sql,params:[]}),
  },"Cloudflare D1 phase 2 audit");
  if(data?.success===false)throw new Error(data?.errors?.[0]?.message||"Cloudflare D1 query failed.");
  const result=Array.isArray(data?.result)?data.result[0]:data?.result;
  return Array.isArray(result?.results)?result.results:[];
}

function razorpayAuth(keyId,keySecret){return "Basic "+Buffer.from(keyId+":"+keySecret,"utf8").toString("base64");}

async function fetchProviderPlan(planId,keyId,keySecret){
  try{
    const data=await fetchJson("https://api.razorpay.com/v1/plans/"+encodeURIComponent(planId),{
      method:"GET",headers:{authorization:razorpayAuth(keyId,keySecret),accept:"application/json"},
    },"Razorpay plan "+fp(planId));
    return{
      fetch_ok:true,id_fingerprint:fp(data?.id),period:text(data?.period)||null,interval:num(data?.interval),
      item_active:data?.item?.active===true,amount_subunits:num(data?.item?.amount??data?.item?.unit_amount),
      currency:text(data?.item?.currency)||null,name:text(data?.item?.name).slice(0,120)||null,
      description:text(data?.item?.description).slice(0,180)||null,
      notes_policy_fingerprint:text(data?.notes?.ca_progress_policy_version_id)?fp(data.notes.ca_progress_policy_version_id):null,
      notes_plan_fingerprint:text(data?.notes?.ca_progress_plan_id)?fp(data.notes.ca_progress_plan_id):null,
      notes_price_kind:text(data?.notes?.price_kind)||null,
    };
  }catch(error){return{fetch_ok:false,error:error instanceof Error?error.message.slice(0,180):"provider_plan_fetch_failed"};}
}

async function fetchProviderOffer(offerId,keyId,keySecret){
  try{
    const data=await fetchJson("https://api.razorpay.com/v1/offers/"+encodeURIComponent(offerId),{
      method:"GET",headers:{authorization:razorpayAuth(keyId,keySecret),accept:"application/json"},
    },"Razorpay offer "+fp(offerId));
    return{
      fetch_ok:true,id_fingerprint:fp(data?.id),active:data?.active===true,name:text(data?.name).slice(0,120)||null,
      display_text:text(data?.display_text).slice(0,180)||null,payment_method:text(data?.payment_method)||null,
      payment_method_type:text(data?.payment_method_type)||null,min_amount:data?.min_amount==null?null:num(data.min_amount),
      max_discount:data?.max_discount==null?null:num(data.max_discount),discount_type:text(data?.discount_type)||null,
      discount_value:data?.discount_value==null?null:num(data.discount_value),starts_at:data?.starts_at??null,ends_at:data?.ends_at??null,
    };
  }catch(error){return{fetch_ok:false,error:error instanceof Error?error.message.slice(0,180):"provider_offer_fetch_failed"};}
}

export function comparePlan(mapping,provider){
  const issues=[];
  if(!provider?.fetch_ok)return{category:"provider_plan_unreachable",issues:["provider_plan_unreachable"]};
  if(fp(mapping.provider_plan_id)!==provider.id_fingerprint)issues.push("plan_identity_mismatch");
  if(text(mapping.period)!==text(provider.period))issues.push("period_mismatch");
  if(num(mapping.interval_value)!==num(provider.interval))issues.push("interval_mismatch");
  if(num(mapping.amount_subunits)!==num(provider.amount_subunits))issues.push("amount_mismatch");
  if(text(mapping.currency)!==text(provider.currency))issues.push("currency_mismatch");
  if(mapping.state!=="ready")issues.push("mapping_not_ready");
  if(provider.item_active===false)issues.push("provider_item_inactive");
  const expectedAmount=text(mapping.price_kind)==="intro"?num(mapping.intro_price_subunits):num(mapping.policy_recurring_price_subunits);
  if(expectedAmount>0&&num(mapping.amount_subunits)!==expectedAmount)issues.push("policy_amount_mismatch");
  const expectedPeriod=text(mapping.billing_duration_unit)==="month"?"monthly":text(mapping.billing_duration_unit)==="year"?"yearly":null;
  if(expectedPeriod&&text(mapping.period)!==expectedPeriod)issues.push("policy_period_mismatch");
  if(num(mapping.interval_value)!==num(mapping.billing_duration_value))issues.push("policy_interval_mismatch");
  if(provider.notes_price_kind&&provider.notes_price_kind!==text(mapping.price_kind))issues.push("provider_note_price_kind_mismatch");
  if(provider.notes_policy_fingerprint&&provider.notes_policy_fingerprint!==fp(mapping.policy_version_id))issues.push("provider_note_policy_mismatch");
  if(provider.notes_plan_fingerprint&&provider.notes_plan_fingerprint!==fp(mapping.internal_plan_id))issues.push("provider_note_internal_plan_mismatch");
  return{category:issues.length?"plan_mismatch":"healthy_plan",issues};
}

function classifySubscriptionPlan(row,byPlan){
  const current=byPlan.get(text(row.provider_plan_id));
  const recurring=byPlan.get(text(row.recurring_provider_plan_id));
  const issues=[];
  if(!current)issues.push("current_plan_mapping_missing");
  if(!recurring)issues.push("recurring_plan_mapping_missing");
  if(current&&text(current.mapping.policy_version_id)!==text(row.policy_version_id))issues.push("current_policy_mismatch");
  if(recurring&&text(recurring.mapping.policy_version_id)!==text(row.policy_version_id))issues.push("recurring_policy_mismatch");
  const usingIntro=Boolean(current&&text(current.mapping.price_kind)==="intro");
  if(usingIntro&&num(row.intro_billing_cycles)<=0)issues.push("intro_mapping_without_intro_cycles");
  if(!usingIntro&&num(row.initial_price_subunits)!==num(row.recurring_price_subunits)&&num(row.paid_count)===0)issues.push("discounted_initial_price_without_intro_plan");
  if(usingIntro&&text(row.provider_plan_id)===text(row.recurring_provider_plan_id))issues.push("intro_and_recurring_plan_same");
  return{
    category:issues.length?"subscription_plan_mismatch":usingIntro?"intro_plan_then_recurring_plan":"recurring_plan_only",
    issues,current_price_kind:current?text(current.mapping.price_kind):null,
    current_amount_subunits:current?num(current.mapping.amount_subunits):null,
    recurring_amount_subunits:recurring?num(recurring.mapping.amount_subunits):null,
    provider_plan_switch_required:usingIntro&&text(row.provider_plan_id)!==text(row.recurring_provider_plan_id),
  };
}

async function main(){
  const configPath=resolve(process.env.CA_BILLING_WRANGLER_CONFIG||"workers/billing/wrangler.jsonc");
  const database=parseDatabaseConfig(await readFile(configPath,"utf8"));
  const accountId=required("CLOUDFLARE_ACCOUNT_ID"),apiToken=required("CLOUDFLARE_API_TOKEN");
  const keyId=required("RAZORPAY_KEY_ID"),keySecret=required("RAZORPAY_KEY_SECRET");
  const [mappingRows,subscriptionRows,campaignRows]=await Promise.all([
    queryD1(accountId,apiToken,database.id,mappingSql),queryD1(accountId,apiToken,database.id,subscriptionPlanSql),queryD1(accountId,apiToken,database.id,campaignSql)
  ]);

  const mappings=[],byPlan=new Map();
  for(const row of mappingRows){
    const providerPlanId=text(row.provider_plan_id);
    const provider=providerPlanId?await fetchProviderPlan(providerPlanId,keyId,keySecret):{fetch_ok:false,error:"missing_provider_plan_id"};
    const classification=comparePlan(row,provider);
    const item={
      mapping_fingerprint:fp(row.id),policy_version_fingerprint:fp(row.policy_version_id),internal_plan_fingerprint:fp(row.internal_plan_id),
      provider_plan_fingerprint:providerPlanId?fp(providerPlanId):null,price_kind:text(row.price_kind)||null,state:text(row.state)||null,
      period:text(row.period)||null,interval:num(row.interval_value),amount_subunits:num(row.amount_subunits),currency:text(row.currency)||null,
      policy_recurring_price_subunits:num(row.policy_recurring_price_subunits),intro_price_subunits:row.intro_price_subunits==null?null:num(row.intro_price_subunits),
      intro_billing_cycles:num(row.intro_billing_cycles),last_checked_at:text(row.last_checked_at)||null,last_error:text(row.last_error).slice(0,180)||null,
      provider,classification,
    };
    mappings.push(item);
    if(providerPlanId)byPlan.set(providerPlanId,{mapping:row,item});
  }

  const subscriptions=subscriptionRows.map(row=>({
    subscription_fingerprint:fp(row.id),user_fingerprint:fp(row.user_id),provider_subscription_fingerprint:fp(row.provider_subscription_id),
    policy_version_fingerprint:fp(row.policy_version_id),current_provider_plan_fingerprint:fp(row.provider_plan_id),
    recurring_provider_plan_fingerprint:fp(row.recurring_provider_plan_id),provider_offer_fingerprint:text(row.provider_offer_id)?fp(row.provider_offer_id):null,
    status:text(row.status)||null,financial_state:text(row.financial_state)||null,initial_price_subunits:num(row.initial_price_subunits),
    recurring_price_subunits:num(row.recurring_price_subunits),intro_billing_cycles:num(row.intro_billing_cycles),
    intro_remaining_cycles:num(row.intro_remaining_cycles),total_count:num(row.total_count),paid_count:num(row.paid_count),auth_attempts:num(row.auth_attempts),
    construction:classifySubscriptionPlan(row,byPlan),
  }));

  const offers=[];
  for(const row of campaignRows){
    const offerId=text(row.provider_offer_id);
    const provider=offerId?await fetchProviderOffer(offerId,keyId,keySecret):{fetch_ok:false,error:"missing_provider_offer_id"};
    offers.push({
      campaign_version_fingerprint:fp(row.id),campaign_fingerprint:fp(row.campaign_id),target_plan_fingerprint:text(row.target_plan_id)?fp(row.target_plan_id):null,
      provider_offer_fingerprint:offerId?fp(offerId):null,
      local:{state:text(row.state)||null,campaign_type:text(row.campaign_type)||null,discount_kind:text(row.discount_kind)||null,
        discount_value:num(row.discount_value),discount_cycles:num(row.discount_cycles),starts_at:text(row.starts_at)||null,ends_at:text(row.ends_at)||null,
        claim_starts_at:text(row.claim_starts_at)||null,claim_ends_at:text(row.claim_ends_at)||null,promo_code_present:Boolean(text(row.promo_code)),
        claim_count:num(row.claim_count),applied_claim_count:num(row.applied_claim_count)},
      provider,
    });
  }

  const summary={
    plan_mappings:mappings.length,healthy_plan_mappings:mappings.filter(x=>x.classification.category==="healthy_plan").length,
    mismatched_plan_mappings:mappings.filter(x=>x.classification.category!=="healthy_plan").length,
    provider_plan_fetch_failures:mappings.filter(x=>!x.provider.fetch_ok).length,intro_plan_mappings:mappings.filter(x=>x.price_kind==="intro").length,
    recurring_plan_mappings:mappings.filter(x=>x.price_kind==="recurring").length,subscriptions:subscriptions.length,
    subscriptions_using_intro_plan:subscriptions.filter(x=>x.construction.category==="intro_plan_then_recurring_plan").length,
    subscriptions_requiring_provider_plan_switch:subscriptions.filter(x=>x.construction.provider_plan_switch_required).length,
    subscription_plan_mismatches:subscriptions.filter(x=>x.construction.category==="subscription_plan_mismatch").length,
    campaigns_with_provider_offer:offers.length,provider_offer_fetch_failures:offers.filter(x=>!x.provider.fetch_ok).length,
  };

  const evidence={schema_version:1,phase:"subscription-repair-phase-2",result:"plan_offer_audit_complete",checked_at:new Date().toISOString(),
    git_sha:text(process.env.GITHUB_SHA)||null,mode:"read-only-production-plan-offer-audit",database:{name:database.name,id_fingerprint:fp(database.id)},
    summary,mappings,subscriptions,offers,safety:{d1_operations:["SELECT"],razorpay_operations:["GET plan","GET offer"],mutations_performed:false,
      plans_created:false,plans_updated:false,offers_created:false,subscriptions_changed:false,payments_changed:false,entitlements_changed:false}};
  const outputPath=resolve(process.env.CA_BILLING_PHASE2_EVIDENCE_PATH||"deployment-evidence/billing-subscription-phase2-plan-offer.json");
  await mkdir(dirname(outputPath),{recursive:true});await writeFile(outputPath,JSON.stringify(evidence,null,2)+"\n","utf8");

  const summaryPath=text(process.env.GITHUB_STEP_SUMMARY);
  if(summaryPath)await appendFile(summaryPath,[
    "## Billing Subscription Repair — Phase 2 Plan/Offer Audit","",
    "**Result:** PLAN/OFFER AUDIT COMPLETE","**Checked:** "+evidence.checked_at,"**Commit:** "+(evidence.git_sha||"unknown"),
    "- Plan mappings: "+summary.plan_mappings,"- Healthy plan mappings: "+summary.healthy_plan_mappings,"- Plan mismatches: "+summary.mismatched_plan_mappings,
    "- Intro plan mappings: "+summary.intro_plan_mappings,"- Recurring plan mappings: "+summary.recurring_plan_mappings,
    "- Subscriptions using intro plan before recurring plan: "+summary.subscriptions_using_intro_plan,
    "- Subscription plan mismatches: "+summary.subscription_plan_mismatches,"- Provider offers referenced by campaigns: "+summary.campaigns_with_provider_offer,
    "- Provider offer fetch failures: "+summary.provider_offer_fetch_failures,"",
    "Read-only: D1 SELECT + Razorpay GET only. No plans, offers, subscriptions, payments, or entitlements were mutated.",""
  ].join("\n"),"utf8");
  console.log(JSON.stringify(summary,null,2));
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked)main().catch(error=>{console.error(error instanceof Error?error.message:"Phase 2 plan/offer audit failed.");process.exitCode=1;});
