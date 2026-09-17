import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const text=(value)=>String(value??"").trim();
const number=(value)=>Number(value??0);
const fingerprint=(value)=>createHash("sha256").update(text(value)).digest("hex").slice(0,12);
const unixIso=(value)=>{const seconds=Number(value);return Number.isFinite(seconds)&&seconds>0?new Date(seconds*1000).toISOString():null;};
const required=(name)=>{const value=text(process.env[name]);if(!value)throw new Error(`${name} is required.`);return value;};
const terminalStatuses=new Set(["cancelled","completed","expired"]);
const knownStatuses=new Set(["created","authenticated","active","pending","halted","paused","cancelled","completed","expired"]);

function parseDatabaseConfig(configText){
  const name=configText.match(/"database_name"\s*:\s*"([^"]+)"/)?.[1];
  const id=configText.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
  if(!name||!id)throw new Error("Could not resolve Billing Worker D1 configuration.");
  return{name,id};
}

export const inventorySql=`SELECT
  rs.id,rs.user_id,rs.plan_id,rs.policy_version_id,
  rs.provider_subscription_id,rs.provider_plan_id,rs.recurring_provider_plan_id,
  rs.status,rs.financial_state,rs.recurring_price_subunits,rs.initial_price_subunits,rs.currency,
  rs.billing_cycle,rs.billing_duration_value,rs.billing_duration_unit,
  rs.trial_days,rs.grace_days,rs.intro_billing_cycles,rs.intro_remaining_cycles,rs.cancellation_mode,
  rs.total_count,rs.paid_count,rs.remaining_count,rs.auth_attempts,
  rs.start_at,rs.current_start,rs.current_end,rs.charge_at,rs.ended_at,rs.paid_through_at,rs.grace_until,
  rs.provider_verified,rs.provider_offer_id,rs.campaign_claim_id,
  rs.created_at,rs.updated_at,rs.last_reconciled_at,
  (SELECT COUNT(*) FROM razorpay_subscription_charges ch WHERE ch.razorpay_subscription_id=rs.id) AS charge_count,
  (SELECT COUNT(*) FROM razorpay_subscription_charges ch WHERE ch.razorpay_subscription_id=rs.id AND ch.status='captured') AS captured_charge_count,
  (SELECT COUNT(*) FROM razorpay_subscription_events e WHERE e.razorpay_subscription_id=rs.id) AS event_count,
  (SELECT COUNT(*) FROM razorpay_subscription_events e WHERE e.razorpay_subscription_id=rs.id AND e.outcome='reconciled') AS reconciled_event_count,
  (SELECT COUNT(*) FROM user_subscriptions us WHERE us.provider_subscription_id=rs.provider_subscription_id) AS access_count,
  (SELECT COUNT(*) FROM billing_reconciliation_cases rc WHERE rc.provider_subscription_id=rs.provider_subscription_id AND rc.state<>'resolved') AS open_case_count,
  (SELECT e.event_type FROM razorpay_subscription_events e WHERE e.razorpay_subscription_id=rs.id ORDER BY COALESCE(e.provider_created_at,e.received_at) DESC,e.received_at DESC LIMIT 1) AS latest_event_type,
  (SELECT e.outcome FROM razorpay_subscription_events e WHERE e.razorpay_subscription_id=rs.id ORDER BY COALESCE(e.provider_created_at,e.received_at) DESC,e.received_at DESC LIMIT 1) AS latest_event_outcome
FROM razorpay_subscriptions rs
ORDER BY rs.created_at ASC
LIMIT 5000`;

async function fetchJson(url,init,label){
  let lastError;
  for(let attempt=1;attempt<=3;attempt+=1){
    try{
      const response=await fetch(url,init);
      const raw=await response.text();
      const data=raw?JSON.parse(raw):null;
      if(!response.ok)throw new Error(`${label} failed: ${data?.error?.description||data?.errors?.[0]?.message||`${response.status} ${response.statusText}`}`);
      return data;
    }catch(error){
      lastError=error;
      if(attempt<3)await new Promise(resolveDelay=>setTimeout(resolveDelay,attempt*500));
    }
  }
  throw lastError;
}

async function queryD1(accountId,apiToken,databaseId,sql){
  const data=await fetchJson(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,{
    method:"POST",
    headers:{authorization:`Bearer ${apiToken}`,"content-type":"application/json",accept:"application/json"},
    body:JSON.stringify({sql,params:[]}),
  },"Cloudflare D1 inventory query");
  if(data?.success===false)throw new Error(data?.errors?.[0]?.message||"Cloudflare D1 query failed.");
  const result=Array.isArray(data?.result)?data.result[0]:data?.result;
  return Array.isArray(result?.results)?result.results:[];
}

async function fetchProviderSubscription(subscriptionId,keyId,keySecret){
  const authorization=Buffer.from(`${keyId}:${keySecret}`,"utf8").toString("base64");
  try{
    const data=await fetchJson(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,{
      method:"GET",
      headers:{authorization:`Basic ${authorization}`,accept:"application/json"},
    },`Razorpay subscription ${fingerprint(subscriptionId)}`);
    return{
      fetch_ok:true,
      id_fingerprint:fingerprint(data?.id),
      plan_id_fingerprint:fingerprint(data?.plan_id),
      offer_id_fingerprint:text(data?.offer_id)?fingerprint(data.offer_id):null,
      status:text(data?.status)||null,
      auth_attempts:number(data?.auth_attempts),
      total_count:number(data?.total_count),
      paid_count:number(data?.paid_count),
      remaining_count:data?.remaining_count==null?null:number(data.remaining_count),
      customer_notify:Boolean(data?.customer_notify),
      created_at:unixIso(data?.created_at),
      start_at:unixIso(data?.start_at),
      current_start:unixIso(data?.current_start),
      current_end:unixIso(data?.current_end),
      charge_at:unixIso(data?.charge_at),
      ended_at:unixIso(data?.ended_at),
      short_url_present:Boolean(text(data?.short_url)),
      has_scheduled_changes:Boolean(data?.has_scheduled_changes),
      source:text(data?.source)||null,
    };
  }catch(error){
    return{fetch_ok:false,error:error instanceof Error?error.message.slice(0,180):"provider_fetch_failed"};
  }
}

export function compareSubscription(local,provider){
  const issues=[];
  const localStatus=text(local?.status);
  const providerStatus=text(provider?.status);
  if(!knownStatuses.has(localStatus))issues.push("unknown_local_status");
  if(!provider?.fetch_ok)return{category:"provider_unreachable",issues:[...issues,"provider_unreachable"]};
  if(!knownStatuses.has(providerStatus))issues.push("unknown_provider_status");
  if(localStatus!==providerStatus)issues.push("status_mismatch");
  if(fingerprint(local?.provider_subscription_id)!==provider.id_fingerprint)issues.push("subscription_identity_mismatch");
  if(fingerprint(local?.provider_plan_id)!==provider.plan_id_fingerprint)issues.push("provider_plan_mismatch");
  const localOffer=text(local?.provider_offer_id);
  if((localOffer?fingerprint(localOffer):null)!==(provider.offer_id_fingerprint??null))issues.push("offer_mismatch");
  if(number(local?.auth_attempts)!==number(provider?.auth_attempts))issues.push("auth_attempts_mismatch");
  if(number(local?.total_count)!==number(provider?.total_count))issues.push("total_count_mismatch");
  if(number(local?.paid_count)!==number(provider?.paid_count))issues.push("paid_count_mismatch");
  if(local?.remaining_count!=null&&provider?.remaining_count!=null&&number(local.remaining_count)!==number(provider.remaining_count))issues.push("remaining_count_mismatch");
  if(number(local?.open_case_count)>0)issues.push("open_reconciliation_case");
  if(number(local?.provider_verified)!==1)issues.push("not_provider_verified");
  if(issues.length===0)return{category:terminalStatuses.has(providerStatus)?"healthy_terminal":"healthy",issues};
  if(issues.includes("status_mismatch"))return{category:"state_mismatch",issues};
  if(issues.includes("provider_plan_mismatch"))return{category:"plan_mismatch",issues};
  if(issues.includes("offer_mismatch"))return{category:"offer_mismatch",issues};
  if(issues.some(issue=>["auth_attempts_mismatch","total_count_mismatch","paid_count_mismatch","remaining_count_mismatch"].includes(issue)))return{category:"provider_counter_mismatch",issues};
  return{category:"needs_reconciliation",issues};
}

function sanitizeLocal(row){
  return{
    local_subscription_fingerprint:fingerprint(row.id),
    user_fingerprint:fingerprint(row.user_id),
    provider_subscription_fingerprint:fingerprint(row.provider_subscription_id),
    internal_plan_fingerprint:fingerprint(row.plan_id),
    policy_version_fingerprint:fingerprint(row.policy_version_id),
    provider_plan_fingerprint:fingerprint(row.provider_plan_id),
    recurring_provider_plan_fingerprint:text(row.recurring_provider_plan_id)?fingerprint(row.recurring_provider_plan_id):null,
    provider_offer_fingerprint:text(row.provider_offer_id)?fingerprint(row.provider_offer_id):null,
    campaign_claim_fingerprint:text(row.campaign_claim_id)?fingerprint(row.campaign_claim_id):null,
    status:text(row.status)||null,
    financial_state:text(row.financial_state)||null,
    recurring_price_subunits:number(row.recurring_price_subunits),
    initial_price_subunits:number(row.initial_price_subunits),
    currency:text(row.currency)||null,
    billing_cycle:text(row.billing_cycle)||null,
    billing_interval:`${number(row.billing_duration_value)} ${text(row.billing_duration_unit)}`.trim(),
    trial_days:number(row.trial_days),
    grace_days:number(row.grace_days),
    intro_billing_cycles:number(row.intro_billing_cycles),
    intro_remaining_cycles:number(row.intro_remaining_cycles),
    cancellation_mode:text(row.cancellation_mode)||null,
    total_count:number(row.total_count),
    paid_count:number(row.paid_count),
    remaining_count:row.remaining_count==null?null:number(row.remaining_count),
    auth_attempts:number(row.auth_attempts),
    start_at:text(row.start_at)||null,
    current_start:text(row.current_start)||null,
    current_end:text(row.current_end)||null,
    charge_at:text(row.charge_at)||null,
    ended_at:text(row.ended_at)||null,
    paid_through_at:text(row.paid_through_at)||null,
    grace_until:text(row.grace_until)||null,
    provider_verified:number(row.provider_verified)===1,
    created_at:text(row.created_at)||null,
    updated_at:text(row.updated_at)||null,
    last_reconciled_at:text(row.last_reconciled_at)||null,
    charge_count:number(row.charge_count),
    captured_charge_count:number(row.captured_charge_count),
    event_count:number(row.event_count),
    reconciled_event_count:number(row.reconciled_event_count),
    access_count:number(row.access_count),
    open_case_count:number(row.open_case_count),
    latest_event_type:text(row.latest_event_type)||null,
    latest_event_outcome:text(row.latest_event_outcome)||null,
  };
}

function duplicateOpenUsers(items){
  const groups=new Map();
  for(const item of items){
    if(!item.provider?.fetch_ok||terminalStatuses.has(text(item.provider.status)))continue;
    const key=item.local.user_fingerprint;
    groups.set(key,[...(groups.get(key)||[]),item]);
  }
  return[...groups.entries()].filter(([,rows])=>rows.length>1).map(([user_fingerprint,rows])=>({
    user_fingerprint,
    open_subscription_count:rows.length,
    provider_subscription_fingerprints:rows.map(row=>row.local.provider_subscription_fingerprint),
    provider_statuses:rows.map(row=>row.provider.status),
  }));
}

function summarize(items,duplicates){
  const categories={};
  const statuses={local:{},provider:{}};
  for(const item of items){
    categories[item.classification.category]=(categories[item.classification.category]||0)+1;
    const localStatus=item.local.status||"unknown";
    statuses.local[localStatus]=(statuses.local[localStatus]||0)+1;
    const providerStatus=item.provider.fetch_ok?(item.provider.status||"unknown"):"unreachable";
    statuses.provider[providerStatus]=(statuses.provider[providerStatus]||0)+1;
  }
  return{
    total_local_subscriptions:items.length,
    provider_fetch_success:items.filter(item=>item.provider.fetch_ok).length,
    provider_fetch_failed:items.filter(item=>!item.provider.fetch_ok).length,
    provider_verified_local:items.filter(item=>item.local.provider_verified).length,
    subscriptions_with_open_reconciliation_cases:items.filter(item=>item.local.open_case_count>0).length,
    subscriptions_with_captured_charges:items.filter(item=>item.local.captured_charge_count>0).length,
    subscriptions_with_access_rows:items.filter(item=>item.local.access_count>0).length,
    duplicate_open_user_groups:duplicates.length,
    categories,
    statuses,
  };
}

async function main(){
  const configPath=resolve(process.env.CA_BILLING_WRANGLER_CONFIG||"workers/billing/wrangler.jsonc");
  const database=parseDatabaseConfig(await readFile(configPath,"utf8"));
  const accountId=required("CLOUDFLARE_ACCOUNT_ID");
  const apiToken=required("CLOUDFLARE_API_TOKEN");
  const keyId=required("RAZORPAY_KEY_ID");
  const keySecret=required("RAZORPAY_KEY_SECRET");
  const rows=await queryD1(accountId,apiToken,database.id,inventorySql);

  const items=[];
  for(const row of rows){
    const subscriptionId=text(row.provider_subscription_id);
    const provider=/^sub_[A-Za-z0-9]+$/.test(subscriptionId)
      ?await fetchProviderSubscription(subscriptionId,keyId,keySecret)
      :{fetch_ok:false,error:"invalid_provider_subscription_id"};
    const local=sanitizeLocal(row);
    items.push({local,provider,classification:compareSubscription(row,provider)});
  }

  const duplicate_open_users=duplicateOpenUsers(items);
  const summary=summarize(items,duplicate_open_users);
  const evidence={
    schema_version:1,
    phase:"subscription-repair-phase-1",
    result:"inventory_complete",
    checked_at:new Date().toISOString(),
    git_sha:text(process.env.GITHUB_SHA)||null,
    mode:"read-only-production-inventory",
    database:{name:database.name,id_fingerprint:fingerprint(database.id)},
    summary,
    duplicate_open_users,
    subscriptions:items,
    safety:{
      d1_operations:["SELECT"],
      razorpay_operations:["GET subscription"],
      mutations_performed:false,
      subscriptions_created:false,
      subscriptions_cancelled:false,
      payment_rows_changed:false,
      entitlements_changed:false,
    },
  };
  const outputPath=resolve(process.env.CA_BILLING_INVENTORY_EVIDENCE_PATH||"deployment-evidence/billing-subscription-inventory.json");
  await mkdir(dirname(outputPath),{recursive:true});
  await writeFile(outputPath,`${JSON.stringify(evidence,null,2)}\n`,"utf8");

  const summaryPath=text(process.env.GITHUB_STEP_SUMMARY);
  if(summaryPath){
    const categoryLines=Object.entries(summary.categories).sort((a,b)=>a[0].localeCompare(b[0])).map(([name,count])=>`- ${name}: ${count}`);
    await appendFile(summaryPath,[
      "## Billing Subscription Repair — Phase 1 Inventory",
      "",
      `**Result:** INVENTORY COMPLETE`,
      `**Checked:** ${evidence.checked_at}`,
      `**Commit:** \`${evidence.git_sha||"unknown"}\``,
      `**Database:** \`${database.name}\``,
      "",
      `- Local subscriptions: ${summary.total_local_subscriptions}`,
      `- Razorpay fetch success: ${summary.provider_fetch_success}`,
      `- Razorpay fetch failed: ${summary.provider_fetch_failed}`,
      `- Duplicate open user groups: ${summary.duplicate_open_user_groups}`,
      `- Open reconciliation cases: ${summary.subscriptions_with_open_reconciliation_cases}`,
      "",
      "### Classification",
      ...(categoryLines.length?categoryLines:["- No subscription rows found."]),
      "",
      "This job is read-only: D1 SELECT + Razorpay GET only. No subscription, payment, entitlement or reconciliation data was mutated.",
      "",
    ].join("\n"),"utf8");
  }
  console.log(JSON.stringify(summary,null,2));
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked)main().catch(error=>{console.error(error instanceof Error?error.message:"Subscription inventory failed.");process.exitCode=1;});
