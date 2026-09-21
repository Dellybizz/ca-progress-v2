import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const clean=(value)=>String(value??"").trim();
const count=(value)=>Number(value??0);
const fp=(value)=>createHash("sha256").update(clean(value)).digest("hex").slice(0,12);
const required=(name)=>{const value=clean(process.env[name]);if(!value)throw new Error(`${name} is required.`);return value;};

function databaseConfig(source){
  const name=source.match(/"database_name"\s*:\s*"([^"]+)"/)?.[1];
  const id=source.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
  if(!name||!id)throw new Error("Could not resolve the production Billing Worker D1 target.");
  return{name,id};
}

async function fetchJson(url,init,label){
  let lastError;
  for(let attempt=1;attempt<=3;attempt+=1){
    try{
      const response=await fetch(url,init);
      const body=await response.text();
      const data=body?JSON.parse(body):null;
      if(!response.ok)throw new Error(`${label} failed: ${data?.error?.description||data?.errors?.[0]?.message||response.status}`);
      return data;
    }catch(error){lastError=error;if(attempt<3)await new Promise(done=>setTimeout(done,attempt*500));}
  }
  throw lastError;
}

async function queryD1(config,sql){
  if(!/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql))throw new Error("Phase 0 permits read-only D1 statements only.");
  if(/\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE|VACUUM|REINDEX|ATTACH|DETACH)\b/i.test(sql))throw new Error("Mutation token rejected by Phase 0 D1 guard.");
  const response=await fetchJson(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/d1/database/${encodeURIComponent(config.databaseId)}/query`,{
    method:"POST",headers:{authorization:`Bearer ${config.apiToken}`,"content-type":"application/json",accept:"application/json"},
    body:JSON.stringify({sql,params:[]}),
  },"Cloudflare D1 Phase 0 query");
  if(response?.success===false)throw new Error(response?.errors?.[0]?.message||"D1 audit query failed.");
  const result=Array.isArray(response?.result)?response.result[0]:response?.result;
  return Array.isArray(result?.results)?result.results:[];
}

const SQL={
  policies:`SELECT sp.id plan_id,sp.tier_key,sp.billing_cycle,sp.active,sp.checkout_enabled,
    pv.id policy_version_id,pv.version,pv.state,pv.name,pv.price_subunits,pv.currency,
    pv.billing_duration_value,pv.billing_duration_unit,pv.trial_days,pv.grace_days,
    ot.intro_price_subunits,COALESCE(ot.intro_billing_cycles,0) intro_billing_cycles,
    ot.cancellation_mode,ot.provider_offer_id,ot.provider_offer_verified_at
    FROM subscription_plans sp
    LEFT JOIN plan_policy_versions pv ON pv.plan_id=sp.id AND pv.state='published'
    LEFT JOIN plan_policy_offer_terms ot ON ot.policy_version_id=pv.id
    ORDER BY sp.sort_order,pv.version DESC LIMIT 500`,
  mappings:`SELECT rpm.id,rpm.policy_version_id,rpm.internal_plan_id,rpm.price_kind,rpm.period,
    rpm.interval_value,rpm.amount_subunits,rpm.currency,rpm.state,rpm.provider_plan_id,
    rpm.last_checked_at,rpm.last_error
    FROM razorpay_plan_mappings rpm ORDER BY rpm.created_at LIMIT 500`,
  subscriptions:`SELECT status,financial_state,COUNT(*) row_count FROM razorpay_subscriptions
    GROUP BY status,financial_state ORDER BY status,financial_state`,
  duplicateOpen:`SELECT user_id,COUNT(*) open_count FROM razorpay_subscriptions
    WHERE status NOT IN ('cancelled','completed','expired') GROUP BY user_id HAVING COUNT(*)>1 ORDER BY open_count DESC LIMIT 500`,
  orphanProvider:`SELECT rs.id,rs.user_id,rs.provider_subscription_id,rs.status
    FROM razorpay_subscriptions rs LEFT JOIN user_subscriptions us ON us.provider_subscription_id=rs.provider_subscription_id
    WHERE rs.status IN ('active','authenticated','pending','paused') AND us.id IS NULL LIMIT 500`,
  accessWithoutProvider:`SELECT us.id,us.user_id,us.provider_subscription_id,us.status
    FROM user_subscriptions us LEFT JOIN razorpay_subscriptions rs ON rs.provider_subscription_id=us.provider_subscription_id
    WHERE us.source='razorpay' AND us.provider_subscription_id IS NOT NULL AND rs.id IS NULL LIMIT 500`,
  orders:`SELECT status,COUNT(*) row_count FROM payment_orders GROUP BY status ORDER BY status`,
  staleOrders:`SELECT id,user_id,provider_order_id,status,created_at FROM payment_orders
    WHERE status IN ('created','attempted') AND datetime(created_at)<datetime('now','-30 minutes') ORDER BY created_at LIMIT 500`,
  events:`SELECT outcome,COUNT(*) row_count,MIN(received_at) oldest_at,MAX(received_at) newest_at
    FROM razorpay_subscription_events GROUP BY outcome ORDER BY outcome`,
  failedEvents:`SELECT id,provider_event_id,event_type,outcome,received_at,processed_at
    FROM razorpay_subscription_events WHERE outcome NOT IN ('reconciled','ignored') ORDER BY received_at LIMIT 500`,
  cases:`SELECT state,severity,reason_code,COUNT(*) row_count,MIN(first_seen_at) oldest_at,MAX(last_seen_at) newest_at
    FROM billing_reconciliation_cases GROUP BY state,severity,reason_code ORDER BY state,severity,reason_code`,
  alerts:`SELECT state,severity,alert_type,COUNT(*) row_count,MIN(created_at) oldest_at,MAX(updated_at) newest_at
    FROM billing_operational_alerts GROUP BY state,severity,alert_type ORDER BY state,severity,alert_type`,
  campaigns:`SELECT cv.id,cv.state,cv.campaign_type,cv.discount_kind,cv.discount_value,cv.provider_offer_id,
    cv.target_plan_id,cv.max_redemptions,cv.per_user_limit,cv.first_n_limit,cv.claimed_count,
    cv.starts_at,cv.ends_at,cv.claim_starts_at,cv.claim_ends_at
    FROM billing_campaign_versions cv ORDER BY cv.created_at LIMIT 500`,
  migrations:`SELECT version,description,source_freeze_commit FROM _ca_schema_migrations ORDER BY version`,
};

function summarizeRows(rows,key="row_count"){return rows.reduce((total,row)=>total+count(row[key]),0);}
function safePolicy(row){return{
  plan_fingerprint:fp(row.plan_id),policy_fingerprint:row.policy_version_id?fp(row.policy_version_id):null,
  tier:clean(row.tier_key),cycle:clean(row.billing_cycle),active:count(row.active)===1,checkout_enabled:count(row.checkout_enabled)===1,
  version:row.version==null?null:count(row.version),state:clean(row.state)||null,name:clean(row.name)||null,
  price_subunits:row.price_subunits==null?null:count(row.price_subunits),currency:clean(row.currency)||null,
  duration:row.billing_duration_value==null?null:`${count(row.billing_duration_value)} ${clean(row.billing_duration_unit)}`,
  trial_days:count(row.trial_days),grace_days:count(row.grace_days),intro_price_subunits:row.intro_price_subunits==null?null:count(row.intro_price_subunits),
  intro_billing_cycles:count(row.intro_billing_cycles),cancellation_mode:clean(row.cancellation_mode)||null,
  provider_offer_fingerprint:clean(row.provider_offer_id)?fp(row.provider_offer_id):null,provider_offer_verified_at:clean(row.provider_offer_verified_at)||null,
};}
function safeMapping(row){return{
  mapping_fingerprint:fp(row.id),policy_fingerprint:fp(row.policy_version_id),plan_fingerprint:fp(row.internal_plan_id),
  kind:clean(row.price_kind),period:clean(row.period),interval:count(row.interval_value),amount_subunits:count(row.amount_subunits),
  currency:clean(row.currency),state:clean(row.state),provider_plan_fingerprint:clean(row.provider_plan_id)?fp(row.provider_plan_id):null,
  last_checked_at:clean(row.last_checked_at)||null,last_error_present:Boolean(clean(row.last_error)),
};}
function safeIdentityRows(rows,idFields){return rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[
  key,idFields.includes(key)&&clean(value)?fp(value):value
])));}

function commercialRisks(policies,mappings){
  const risks=[];
  const published=policies.filter(row=>row.state==="published"&&row.active);
  const basic=published.filter(row=>row.tier==="basic"&&row.cycle==="monthly");
  const pro=published.filter(row=>row.tier==="pro"&&row.cycle==="monthly");
  if(basic.length!==1)risks.push({code:"basic_monthly_policy_cardinality",severity:"critical",observed:basic.length,expected:1});
  if(basic.length===1&&basic[0].price_subunits!==5000)risks.push({code:"basic_monthly_price_drift",severity:"critical",observed:basic[0].price_subunits,expected:5000});
  if(pro.length!==1)risks.push({code:"pro_monthly_policy_cardinality",severity:"critical",observed:pro.length,expected:1});
  if(pro.length===1&&pro[0].price_subunits!==15000)risks.push({code:"pro_monthly_price_drift",severity:"critical",observed:pro[0].price_subunits,expected:15000});
  if(basic.length===1&&(basic[0].intro_price_subunits!==2500||basic[0].intro_billing_cycles!==1))risks.push({code:"basic_intro_terms_drift",severity:"warning",observed:{price:basic[0].intro_price_subunits,cycles:basic[0].intro_billing_cycles},expected:{price:2500,cycles:1}});
  for(const policy of published.filter(row=>row.checkout_enabled)){
    const linked=mappings.filter(mapping=>mapping.policy_fingerprint===policy.policy_fingerprint&&mapping.kind==="recurring"&&mapping.state==="ready");
    if(linked.length!==1)risks.push({code:"checkout_policy_mapping_cardinality",severity:"critical",policy_fingerprint:policy.policy_fingerprint,observed:linked.length,expected:1});
  }
  return risks;
}

async function providerGet(path,keyId,keySecret){
  try{return{ok:true,data:await fetchJson(`https://api.razorpay.com/v1/${path}`,{method:"GET",headers:{authorization:`Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,accept:"application/json"}},`Razorpay ${path.split("/")[0]}`)};}
  catch(error){return{ok:false,error:error instanceof Error?error.message.slice(0,180):"provider_fetch_failed"};}
}

async function main(){
  const configPath=resolve(process.env.CA_BILLING_WRANGLER_CONFIG||"workers/billing/wrangler.jsonc");
  const database=databaseConfig(await readFile(configPath,"utf8"));
  const config={accountId:required("CLOUDFLARE_ACCOUNT_ID"),apiToken:required("CLOUDFLARE_API_TOKEN"),databaseId:database.id};
  const keyId=required("RAZORPAY_KEY_ID"),keySecret=required("RAZORPAY_KEY_SECRET");
  const entries=await Promise.all(Object.entries(SQL).map(async([name,sql])=>[name,await queryD1(config,sql)]));
  const snapshot=Object.fromEntries(entries);
  const policies=snapshot.policies.map(safePolicy),mappings=snapshot.mappings.map(safeMapping);
  const providerPlans=[];
  for(const row of snapshot.mappings){
    const providerId=clean(row.provider_plan_id);if(!providerId)continue;
    const response=await providerGet(`plans/${encodeURIComponent(providerId)}`,keyId,keySecret);
    providerPlans.push({provider_plan_fingerprint:fp(providerId),fetch_ok:response.ok,...(response.ok?{
      amount_subunits:count(response.data?.item?.amount),currency:clean(response.data?.item?.currency),period:clean(response.data?.period),interval:count(response.data?.interval),item_active:response.data?.item?.active===true,
    }:{error:response.error})});
  }
  const offerIds=[...new Set(snapshot.policies.map(row=>clean(row.provider_offer_id)).concat(snapshot.campaigns.map(row=>clean(row.provider_offer_id))).filter(Boolean))];
  const providerOffers=[];
  for(const offerId of offerIds){
    const response=await providerGet(`offers/${encodeURIComponent(offerId)}`,keyId,keySecret);
    providerOffers.push({provider_offer_fingerprint:fp(offerId),fetch_ok:response.ok,...(response.ok?{
      active:response.data?.active===true,discount_type:clean(response.data?.discount_type),discount_value:response.data?.discount_value==null?null:count(response.data.discount_value),payment_method:clean(response.data?.payment_method)||null,payment_method_type:clean(response.data?.payment_method_type)||null,
    }:{error:response.error})});
  }
  const risks=commercialRisks(policies,mappings);
  if(snapshot.duplicateOpen.length)risks.push({code:"duplicate_open_subscription_candidates",severity:"critical",count:snapshot.duplicateOpen.length});
  if(snapshot.orphanProvider.length)risks.push({code:"provider_subscriptions_without_access",severity:"critical",count:snapshot.orphanProvider.length});
  if(snapshot.accessWithoutProvider.length)risks.push({code:"access_without_provider_projection",severity:"critical",count:snapshot.accessWithoutProvider.length});
  if(snapshot.staleOrders.length)risks.push({code:"stale_checkout_orders",severity:"warning",count:snapshot.staleOrders.length});
  if(snapshot.failedEvents.length)risks.push({code:"unresolved_subscription_events",severity:"critical",count:snapshot.failedEvents.length});
  const openCases=snapshot.cases.filter(row=>row.state!=="resolved");if(summarizeRows(openCases))risks.push({code:"open_reconciliation_cases",severity:"warning",count:summarizeRows(openCases)});
  const evidence={
    schema_version:1,phase:"payment-phase-0",result:"inventory_complete",checked_at:new Date().toISOString(),git_sha:clean(process.env.GITHUB_SHA)||null,
    mode:"read-only-production-truth-map",database:{name:database.name,id_fingerprint:fp(database.id),latest_migration:clean(snapshot.migrations.at(-1)?.version)||null},
    commercial:{policies,mappings,provider_plans:providerPlans,provider_offers:providerOffers},
    operations:{
      subscription_statuses:snapshot.subscriptions,payment_order_statuses:snapshot.orders,event_outcomes:snapshot.events,
      reconciliation_cases:snapshot.cases,operational_alerts:snapshot.alerts,
      duplicate_open_candidates:safeIdentityRows(snapshot.duplicateOpen,["user_id"]),
      provider_without_access:safeIdentityRows(snapshot.orphanProvider,["id","user_id","provider_subscription_id"]),
      access_without_provider:safeIdentityRows(snapshot.accessWithoutProvider,["id","user_id","provider_subscription_id"]),
      stale_orders:safeIdentityRows(snapshot.staleOrders,["id","user_id","provider_order_id"]),
      unresolved_events:safeIdentityRows(snapshot.failedEvents,["id","provider_event_id"]),
      campaigns:safeIdentityRows(snapshot.campaigns,["id","target_plan_id","provider_offer_id"]),
    },
    summary:{policies:policies.length,mappings:mappings.length,subscriptions:summarizeRows(snapshot.subscriptions),payment_orders:summarizeRows(snapshot.orders),
      duplicate_open_candidates:snapshot.duplicateOpen.length,provider_without_access:snapshot.orphanProvider.length,access_without_provider:snapshot.accessWithoutProvider.length,
      stale_orders:snapshot.staleOrders.length,unresolved_events:snapshot.failedEvents.length,open_reconciliation_cases:summarizeRows(openCases),risks:risks.length,critical_risks:risks.filter(r=>r.severity==="critical").length},
    risks,
    authority_map:{commercial_policy:"D1 versioned commercial policy",provider_terms:"Razorpay GET validation",payment_truth:"Razorpay verified state and signed webhook evidence",checkout_expectation:"immutable D1 order/subscription snapshots",subscription_projection:"D1 razorpay_subscriptions",effective_access:"server entitlement policy",operator_actions:"idempotent request and immutable admin audit",mismatches:"durable reconciliation cases and operational alerts"},
    state_model:{known:["created","authenticated","active","pending","halted","paused","cancelled","completed","expired"],terminal:["cancelled","completed","expired"],financial:["pending","paid","failed","refunded","disputed"]},
    safety:{d1_operations:["SELECT"],razorpay_operations:["GET plan","GET offer"],mutations_performed:false,pricing_changed:false,subscriptions_changed:false,payments_changed:false,entitlements_changed:false,secrets_in_evidence:false,raw_payloads_in_evidence:false},
  };
  const output=resolve(process.env.CA_PAYMENT_PHASE0_EVIDENCE_PATH||"deployment-evidence/payment-phase0-truth-map.json");
  await mkdir(dirname(output),{recursive:true});await writeFile(output,`${JSON.stringify(evidence,null,2)}\n`,`utf8`);
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,["## Payment Phase 0 — production truth map","",`**Result:** INVENTORY COMPLETE`,`**Checked:** ${evidence.checked_at}`,`**Commit:** \`${evidence.git_sha||"unknown"}\``,"",`- Published policy rows: ${evidence.summary.policies}`,`- Razorpay mappings: ${evidence.summary.mappings}`,`- Recurring subscriptions: ${evidence.summary.subscriptions}`,`- Duplicate open candidates: ${evidence.summary.duplicate_open_candidates}`,`- Stale orders: ${evidence.summary.stale_orders}`,`- Open reconciliation cases: ${evidence.summary.open_reconciliation_cases}`,`- Critical risks: ${evidence.summary.critical_risks}`,"","Read-only proof: D1 SELECT + Razorpay GET only. No commercial or customer state was mutated.",""].join("\n"),"utf8");
  console.log(JSON.stringify(evidence.summary,null,2));
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked)main().catch(error=>{console.error(error instanceof Error?error.message:"Payment Phase 0 audit failed.");process.exitCode=1;});

export { SQL, commercialRisks, databaseConfig, safePolicy, safeMapping };
