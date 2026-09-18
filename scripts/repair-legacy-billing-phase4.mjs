import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const text=(value)=>String(value??"").trim();
const num=(value)=>Number(value??0);
const fp=(value)=>createHash("sha256").update(text(value)).digest("hex").slice(0,12);
const sha256=(value)=>createHash("sha256").update(String(value)).digest("hex");
const unixIso=(value)=>{const seconds=Number(value);return Number.isFinite(seconds)&&seconds>0?new Date(seconds*1000).toISOString():null;};
const required=(name)=>{const value=text(process.env[name]);if(!value)throw new Error(name+" is required.");return value;};

function parseDatabaseConfig(configText){
  const name=configText.match(/"database_name"\s*:\s*"([^"]+)"/)?.[1];
  const id=configText.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
  if(!name||!id)throw new Error("Could not resolve Billing Worker D1 configuration.");
  return {name,id};
}

export const policySql="SELECT sp.id AS plan_id,sp.tier_key,pv.id AS policy_version_id,pv.price_subunits AS recurring_price_subunits,pv.currency,pv.billing_duration_value,pv.billing_duration_unit,ot.intro_price_subunits,COALESCE(ot.intro_billing_cycles,0) AS intro_billing_cycles,ot.provider_offer_id,ot.provider_offer_verified_at,ot.provider_offer_snapshot_json FROM subscription_plans sp JOIN plan_policy_versions pv ON pv.plan_id=sp.id JOIN plan_policy_offer_terms ot ON ot.policy_version_id=pv.id WHERE sp.active=1 AND sp.checkout_enabled=1 AND sp.tier_key='basic' AND sp.billing_cycle='monthly' AND pv.state='published' AND (pv.effective_at IS NULL OR pv.effective_at<=CURRENT_TIMESTAMP) ORDER BY COALESCE(pv.effective_at,pv.published_at,pv.created_at) DESC,pv.version DESC LIMIT 1";

export const legacySql="SELECT rs.id,rs.user_id,rs.plan_id,rs.policy_version_id,rs.provider_subscription_id,rs.provider_plan_id,rs.recurring_provider_plan_id,rs.status,rs.financial_state,rs.paid_count,rs.auth_attempts,rs.provider_offer_id,rs.created_at,(SELECT COUNT(*) FROM razorpay_subscription_charges ch WHERE ch.razorpay_subscription_id=rs.id) AS charge_count,(SELECT COUNT(*) FROM user_subscriptions us WHERE us.provider_subscription_id=rs.provider_subscription_id) AS access_count,(SELECT COUNT(*) FROM billing_reconciliation_cases rc WHERE rc.provider_subscription_id=rs.provider_subscription_id AND rc.state<>'resolved') AS open_case_count FROM razorpay_subscriptions rs JOIN subscription_plans sp ON sp.id=rs.plan_id WHERE sp.tier_key='basic' AND rs.provider_plan_id<>rs.recurring_provider_plan_id AND rs.status IN ('created','authenticated') ORDER BY rs.created_at ASC LIMIT 20";

export const repairedSql="SELECT COUNT(*) AS repaired_count FROM razorpay_subscriptions rs JOIN subscription_plans sp ON sp.id=rs.plan_id WHERE sp.tier_key='basic' AND rs.provider_plan_id<>rs.recurring_provider_plan_id AND rs.status='cancelled' AND rs.paid_count=0 AND rs.auth_attempts=0";

async function fetchJson(url,init,label){
  let lastError;
  for(let attempt=1;attempt<=3;attempt+=1){
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

async function d1(accountId,apiToken,databaseId,sql,params=[]){
  const data=await fetchJson("https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(accountId)+"/d1/database/"+encodeURIComponent(databaseId)+"/query",{
    method:"POST",
    headers:{authorization:"Bearer "+apiToken,"content-type":"application/json",accept:"application/json"},
    body:JSON.stringify({sql,params}),
  },"Cloudflare D1 Phase 4 query");
  if(data?.success===false)throw new Error(data?.errors?.[0]?.message||"Cloudflare D1 query failed.");
  const result=Array.isArray(data?.result)?data.result[0]:data?.result;
  return result||{results:[],meta:{}};
}

const basicAuth=(keyId,keySecret)=>"Basic "+Buffer.from(keyId+":"+keySecret,"utf8").toString("base64");
async function rp(path,keyId,keySecret,init={}){
  const headers={authorization:basicAuth(keyId,keySecret),accept:"application/json","content-type":"application/json",...(init.headers||{})};
  return fetchJson("https://api.razorpay.com/v1/"+path,{...init,headers},"Razorpay Phase 4 request");
}

async function fetchSubscription(id,keyId,keySecret){
  const data=await rp("subscriptions/"+encodeURIComponent(id),keyId,keySecret,{method:"GET"});
  return {
    raw:data,
    id:text(data?.id),
    status:text(data?.status),
    plan_id:text(data?.plan_id),
    offer_id:text(data?.offer_id)||null,
    auth_attempts:num(data?.auth_attempts),
    paid_count:num(data?.paid_count),
    remaining_count:data?.remaining_count==null?null:num(data.remaining_count),
    ended_at:unixIso(data?.ended_at),
    created_at:unixIso(data?.created_at),
    short_url_present:Boolean(text(data?.short_url)),
  };
}

async function fetchOffer(id,keyId,keySecret){
  const data=await rp("offers/"+encodeURIComponent(id),keyId,keySecret,{method:"GET"});
  return {
    raw:data,
    id:text(data?.id),
    entity:text(data?.entity)||null,
    active:data?.active!==false,
    discount_type:text(data?.discount_type)||null,
    discount_value:data?.discount_value==null?null:num(data.discount_value),
    payment_method:text(data?.payment_method)||null,
    payment_method_type:text(data?.payment_method_type)||null,
    starts_at:data?.starts_at??null,
    ends_at:data?.ends_at??null,
  };
}

export function assessOffer(policy,offer){
  const issues=[];
  if(!offer?.id||!/^offer_[A-Za-z0-9]+$/.test(offer.id))issues.push("invalid_offer_id");
  if(offer?.active===false)issues.push("offer_disabled");
  const expectedDiscount=num(policy?.recurring_price_subunits)-num(policy?.intro_price_subunits);
  if(expectedDiscount<=0)issues.push("invalid_intro_discount");
  if(offer?.discount_type&&offer.discount_type!=="flat")issues.push("offer_not_flat_discount");
  if(offer?.discount_value!=null&&num(offer.discount_value)!==expectedDiscount)issues.push("offer_discount_value_mismatch");
  if(offer?.payment_method&&offer.payment_method!=="upi")issues.push("offer_payment_method_not_upi");
  return {ready:issues.length===0,issues,expected_discount_subunits:expectedDiscount};
}

export function assessLegacy(local,provider){
  const issues=[];
  if(!provider?.id)issues.push("provider_unreachable");
  if(text(local?.status)!=="created"&&text(local?.status)!=="authenticated")issues.push("local_status_not_repairable");
  if(num(local?.paid_count)!==0)issues.push("local_paid_count_nonzero");
  if(num(local?.auth_attempts)!==0)issues.push("local_auth_attempts_nonzero");
  if(num(local?.charge_count)!==0)issues.push("charge_rows_present");
  if(num(local?.access_count)!==0)issues.push("access_rows_present");
  if(num(local?.open_case_count)!==0)issues.push("open_reconciliation_case");
  if(text(local?.provider_plan_id)===text(local?.recurring_provider_plan_id))issues.push("not_legacy_split_plan");
  if(provider?.id&&provider.id!==text(local?.provider_subscription_id))issues.push("provider_identity_mismatch");
  if(provider?.plan_id&&provider.plan_id!==text(local?.provider_plan_id))issues.push("provider_plan_mismatch");
  if(provider?.status&&!["created","authenticated","cancelled"].includes(provider.status))issues.push("provider_status_not_repairable");
  if(num(provider?.paid_count)!==0)issues.push("provider_paid_count_nonzero");
  if(num(provider?.auth_attempts)!==0)issues.push("provider_auth_attempts_nonzero");
  return {safe:issues.length===0,issues,provider_already_cancelled:provider?.status==="cancelled"};
}

function sanitizedSubscription(local,provider,assessment){
  return {
    local_subscription_fingerprint:fp(local.id),
    user_fingerprint:fp(local.user_id),
    provider_subscription_fingerprint:fp(local.provider_subscription_id),
    policy_version_fingerprint:fp(local.policy_version_id),
    legacy_provider_plan_fingerprint:fp(local.provider_plan_id),
    recurring_provider_plan_fingerprint:fp(local.recurring_provider_plan_id),
    local_status:text(local.status),
    financial_state:text(local.financial_state),
    paid_count:num(local.paid_count),
    auth_attempts:num(local.auth_attempts),
    charge_count:num(local.charge_count),
    access_count:num(local.access_count),
    open_case_count:num(local.open_case_count),
    provider:{
      status:provider?.status||null,
      paid_count:num(provider?.paid_count),
      auth_attempts:num(provider?.auth_attempts),
      plan_fingerprint:provider?.plan_id?fp(provider.plan_id):null,
      offer_fingerprint:provider?.offer_id?fp(provider.offer_id):null,
      short_url_present:Boolean(provider?.short_url_present),
    },
    assessment,
  };
}

async function bindPolicyOffer(ctx,policy,offer){
  const snapshot=JSON.stringify({
    id_fingerprint:fp(offer.id),
    entity:offer.entity,
    active:offer.active,
    discount_type:offer.discount_type,
    discount_value:offer.discount_value,
    payment_method:offer.payment_method,
    payment_method_type:offer.payment_method_type,
    verified_at:new Date().toISOString(),
  });
  const result=await d1(ctx.accountId,ctx.apiToken,ctx.databaseId,
    "UPDATE plan_policy_offer_terms SET provider_offer_id=?1,provider_offer_verified_at=?2,provider_offer_snapshot_json=?3,updated_at=?2 WHERE policy_version_id=?4 AND (provider_offer_id IS NULL OR provider_offer_id=?1)",
    [offer.id,new Date().toISOString(),snapshot,policy.policy_version_id]);
  if(num(result?.meta?.changes)!==1)throw new Error("Policy offer binding changed an unexpected number of rows.");
}

async function reconcileCancelled(ctx,local,provider){
  const stamp=new Date().toISOString();
  const state=JSON.stringify({
    id:provider.id,status:provider.status,plan_id_fingerprint:fp(provider.plan_id),
    offer_id_fingerprint:provider.offer_id?fp(provider.offer_id):null,
    paid_count:provider.paid_count,auth_attempts:provider.auth_attempts,ended_at:provider.ended_at,
    repair:"phase4_legacy_intro",
  });
  const updated=await d1(ctx.accountId,ctx.apiToken,ctx.databaseId,
    "UPDATE razorpay_subscriptions SET status='cancelled',ended_at=COALESCE(?1,ended_at,?2),provider_verified=1,provider_state_json=?3,last_reconciled_at=?2,updated_at=?2 WHERE id=?4 AND status IN ('created','authenticated') AND paid_count=0 AND auth_attempts=0",
    [provider.ended_at,stamp,state,local.id]);
  if(num(updated?.meta?.changes)!==1)throw new Error("Local subscription repair changed an unexpected number of rows.");

  const evidence=JSON.stringify({
    phase:"subscription-repair-phase-4",
    provider_status:"cancelled",
    provider_subscription_fingerprint:fp(provider.id),
    legacy_provider_plan_fingerprint:fp(local.provider_plan_id),
    recurring_provider_plan_fingerprint:fp(local.recurring_provider_plan_id),
  });
  await d1(ctx.accountId,ctx.apiToken,ctx.databaseId,
    "INSERT OR IGNORE INTO razorpay_subscription_events(id,provider_event_id,razorpay_subscription_id,provider_subscription_id,event_type,payload_sha256,evidence_json,outcome,received_at,processed_at) VALUES(?1,?2,?3,?4,'repair.legacy_intro.cancelled',?5,?6,'reconciled',?7,?7)",
    [crypto.randomUUID(),"repair:phase4:"+provider.id,local.id,provider.id,sha256(evidence),evidence,stamp]);
}

async function cancelLegacy(ctx,local,provider){
  let current=provider;
  if(current.status!=="cancelled"){
    await rp("subscriptions/"+encodeURIComponent(current.id)+"/cancel",ctx.keyId,ctx.keySecret,{method:"POST",body:JSON.stringify({cancel_at_cycle_end:0})});
    current=await fetchSubscription(current.id,ctx.keyId,ctx.keySecret);
  }
  if(current.status!=="cancelled")throw new Error("Razorpay did not confirm immediate cancellation for "+fp(current.id)+".");
  await reconcileCancelled(ctx,local,current);
  return current;
}

async function main(){
  const mode=text(process.env.CA_BILLING_PHASE4_MODE||"audit").toLowerCase();
  if(!["audit","repair"].includes(mode))throw new Error("CA_BILLING_PHASE4_MODE must be audit or repair.");
  const configPath=resolve(process.env.CA_BILLING_WRANGLER_CONFIG||"workers/billing/wrangler.jsonc");
  const database=parseDatabaseConfig(await readFile(configPath,"utf8"));
  const ctx={
    accountId:required("CLOUDFLARE_ACCOUNT_ID"),
    apiToken:required("CLOUDFLARE_API_TOKEN"),
    databaseId:database.id,
    keyId:required("RAZORPAY_KEY_ID"),
    keySecret:required("RAZORPAY_KEY_SECRET"),
  };

  const policy=(await d1(ctx.accountId,ctx.apiToken,ctx.databaseId,policySql)).results?.[0]||null;
  if(!policy)throw new Error("Current Basic monthly commercial policy was not found.");
  const requestedOffer=text(process.env.CA_BILLING_PHASE4_PROVIDER_OFFER_ID);
  const configuredOffer=text(policy.provider_offer_id);
  if(requestedOffer&&configuredOffer&&requestedOffer!==configuredOffer)throw new Error("Requested Offer ID conflicts with the policy's existing Offer binding.");
  const offerId=requestedOffer||configuredOffer;
  let offer=null,offerAssessment={ready:false,issues:["provider_offer_missing"],expected_discount_subunits:num(policy.recurring_price_subunits)-num(policy.intro_price_subunits)};
  if(offerId){
    if(!/^offer_[A-Za-z0-9]+$/.test(offerId))throw new Error("A valid Razorpay offer_ identifier is required.");
    offer=await fetchOffer(offerId,ctx.keyId,ctx.keySecret);
    if(offer.id!==offerId)throw new Error("Razorpay returned a different Offer identifier.");
    offerAssessment=assessOffer(policy,offer);
  }

  const legacyRows=(await d1(ctx.accountId,ctx.apiToken,ctx.databaseId,legacySql)).results||[];
  const repairedCount=num((await d1(ctx.accountId,ctx.apiToken,ctx.databaseId,repairedSql)).results?.[0]?.repaired_count);
  const inspected=[];
  for(const row of legacyRows){
    let provider=null;
    try{provider=await fetchSubscription(text(row.provider_subscription_id),ctx.keyId,ctx.keySecret);}catch(error){provider={error:error instanceof Error?error.message:"provider_fetch_failed"};}
    const assessment=assessLegacy(row,provider);
    inspected.push({row,provider,assessment,sanitized:sanitizedSubscription(row,provider,assessment)});
  }

  const allSafe=inspected.every(item=>item.assessment.safe);
  const expectedLegacyCount=2;
  let result="blocked";
  let blockedReason=null;
  if(!offerAssessment.ready)blockedReason="provider_offer_not_ready";
  else if(legacyRows.length===0&&repairedCount>=expectedLegacyCount)result="already_repaired";
  else if(legacyRows.length!==expectedLegacyCount)blockedReason="unexpected_legacy_subscription_count";
  else if(!allSafe)blockedReason="legacy_subscription_not_safe_to_repair";
  else result=mode==="repair"?"repair_ready":"audit_ready";

  const mutations={offer_bound:false,subscriptions_cancelled:0,d1_subscriptions_reconciled:0};
  if(mode==="repair"){
    if(text(process.env.CA_BILLING_PHASE4_CONFIRMATION)!=="REPAIR LEGACY INTRO SUBSCRIPTIONS")throw new Error("Explicit repair confirmation is required.");
    if(result==="already_repaired"){
      // idempotent no-op
    }else{
      if(result!=="repair_ready")throw new Error("Phase 4 repair is blocked: "+blockedReason+".");
      if(!configuredOffer){
        await bindPolicyOffer(ctx,policy,offer);
        mutations.offer_bound=true;
      }
      for(const item of inspected){
        const finalProvider=await cancelLegacy(ctx,item.row,item.provider);
        mutations.subscriptions_cancelled+=item.provider.status==="cancelled"?0:1;
        mutations.d1_subscriptions_reconciled+=finalProvider.status==="cancelled"?1:0;
      }
      result="repaired";
    }
  }

  const evidence={
    schema_version:1,
    phase:"subscription-repair-phase-4",
    checked_at:new Date().toISOString(),
    git_sha:text(process.env.GITHUB_SHA)||null,
    mode,
    result,
    blocked_reason:blockedReason,
    database:{name:database.name,id_fingerprint:fp(database.id)},
    policy:{
      plan_fingerprint:fp(policy.plan_id),
      policy_version_fingerprint:fp(policy.policy_version_id),
      recurring_price_subunits:num(policy.recurring_price_subunits),
      intro_price_subunits:num(policy.intro_price_subunits),
      intro_billing_cycles:num(policy.intro_billing_cycles),
      configured_offer_fingerprint:configuredOffer?fp(configuredOffer):null,
    },
    offer:offer?{
      id_fingerprint:fp(offer.id),active:offer.active,discount_type:offer.discount_type,
      discount_value:offer.discount_value,payment_method:offer.payment_method,
      payment_method_type:offer.payment_method_type,assessment:offerAssessment,
    }:{assessment:offerAssessment},
    legacy_subscription_count:legacyRows.length,
    previously_repaired_legacy_count:repairedCount,
    subscriptions:inspected.map(item=>item.sanitized),
    mutations,
    safety:{
      replacements_created:false,
      payment_rows_changed:false,
      entitlement_rows_changed:false,
      subscription_rows_deleted:false,
      bulk_cancellation:false,
      repair_requires_verified_offer:true,
      repair_requires_zero_payment_zero_auth_attempts:true,
      repair_requires_explicit_confirmation:true,
    },
  };

  const outputPath=resolve(process.env.CA_BILLING_PHASE4_EVIDENCE_PATH||"deployment-evidence/billing-subscription-phase4-repair.json");
  await mkdir(dirname(outputPath),{recursive:true});
  await writeFile(outputPath,JSON.stringify(evidence,null,2)+"\n","utf8");

  const summaryPath=text(process.env.GITHUB_STEP_SUMMARY);
  if(summaryPath)await appendFile(summaryPath,[
    "## Billing Subscription Repair — Phase 4","",
    "**Mode:** "+mode,
    "**Result:** "+result,
    blockedReason?"**Blocked:** "+blockedReason:"",
    "- Legacy candidates: "+legacyRows.length,
    "- Previously repaired legacy rows: "+repairedCount,
    "- Offer ready: "+String(offerAssessment.ready),
    "- Offer bound this run: "+String(mutations.offer_bound),
    "- Provider subscriptions cancelled this run: "+mutations.subscriptions_cancelled,
    "- D1 subscription rows reconciled this run: "+mutations.d1_subscriptions_reconciled,
    "",
    "No replacement subscription, payment-row mutation, entitlement grant, row deletion, or bulk cancellation is permitted by this workflow.",""
  ].filter(Boolean).join("\n"),"utf8");

  console.log(JSON.stringify({mode,result,blockedReason,legacy_subscription_count:legacyRows.length,repaired_count:repairedCount,offer_ready:offerAssessment.ready,mutations},null,2));
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked)main().catch(error=>{console.error(error instanceof Error?error.message:"Phase 4 repair failed.");process.exitCode=1;});
