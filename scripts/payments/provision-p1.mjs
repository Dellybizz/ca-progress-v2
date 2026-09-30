import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { mappingMatches } from '../../lib/billing/payment-quote.mjs';
export function assertProviderPlan(policy, plan) {
  const period=policy.billing_duration_unit==='year'?'yearly':'monthly';
  if(!/^plan_[A-Za-z0-9]+$/.test(String(plan?.id))||plan.period!==period||Number(plan.interval)!==Number(policy.billing_duration_value)||Number(plan.item?.amount)!==Number(policy.price_subunits)||plan.item?.currency!==policy.currency)throw new Error('Provider plan does not match policy terms');
}
async function main(){
  const config=JSON.parse((await readFile('wrangler.jsonc','utf8')).replace(/\/\/[^\n]*/g,''));
  const databaseId=config.d1_databases[0].database_id,account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,keyId=process.env.RAZORPAY_KEY_ID,keySecret=process.env.RAZORPAY_KEY_SECRET;
  if(!account||!token||!keyId||!keySecret)throw new Error('Cloudflare and Razorpay credentials are required');
  if(!keyId.startsWith('rzp_live_'))throw new Error('Live release requires a live Razorpay key');
  async function sql(query,params=[]){const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${databaseId}/query`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({sql:query,params}),signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok||!result.success||result.result.some(row=>!row.success))throw new Error('D1 policy operation failed');return result.result[0];}
  async function rp(path,init={}){const response=await fetch(`https://api.razorpay.com/v1/${path}`,{...init,headers:{authorization:`Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,'content-type':'application/json'},redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Provider plan operation failed (${response.status})`);return response.json();}
  const stamp=new Date().toISOString(),policies=(await sql("SELECT pv.*,sp.tier_key,sp.billing_cycle FROM subscription_plans sp JOIN plan_policy_versions pv ON pv.plan_id=sp.id WHERE sp.active=1 AND sp.checkout_enabled=1 AND sp.tier_key<>'free' AND pv.id=(SELECT id FROM plan_policy_versions WHERE plan_id=sp.id AND state='published' AND (effective_at IS NULL OR effective_at<=?1) ORDER BY COALESCE(effective_at,published_at,created_at) DESC,version DESC LIMIT 1)",[stamp])).results;
  const evidence=[];
  for(const policy of policies){
    if(policy.currency!=='INR'||!Number.isSafeInteger(policy.price_subunits)||policy.price_subunits<100||!Number.isSafeInteger(policy.billing_duration_value)||policy.billing_duration_value<1||policy.billing_duration_unit!==(policy.billing_cycle==='monthly'?'month':'year'))throw new Error('Invalid recurring policy');
    let mapping=(await sql("SELECT * FROM razorpay_plan_mappings WHERE policy_version_id=?1 AND price_kind='recurring'",[policy.id])).results[0];
    if(mapping){if(!mappingMatches(policy,mapping))throw new Error('Existing mapping requires operator reconciliation');const plan=await rp(`plans/${encodeURIComponent(mapping.provider_plan_id)}`);assertProviderPlan(policy,plan);await sql('UPDATE razorpay_plan_mappings SET last_checked_at=?1 WHERE id=?2',[stamp,mapping.id]);evidence.push({tier:policy.tier_key,cycle:policy.billing_cycle,version:policy.version,result:'validated'});continue;}
    const mappingId=crypto.randomUUID(),leaseToken=crypto.randomUUID(),period=policy.billing_cycle==='monthly'?'monthly':'yearly';
    const claimed=await sql("INSERT OR IGNORE INTO razorpay_plan_mappings(id,policy_version_id,internal_plan_id,price_kind,period,interval_value,amount_subunits,currency,state,sync_token,lease_until) VALUES(?1,?2,?3,'recurring',?4,?5,?6,?7,'creating',?8,?9)",[mappingId,policy.id,policy.plan_id,period,policy.billing_duration_value,policy.price_subunits,policy.currency,leaseToken,new Date(Date.now()+30000).toISOString()]);
    if(Number(claimed.meta?.changes)!==1)throw new Error('Another process reserved this mapping');
    try{const plan=await rp('plans',{method:'POST',body:JSON.stringify({period,interval:policy.billing_duration_value,item:{name:`CA Progress ${policy.tier_key==='basic'?'Basic':'Pro'}`,amount:policy.price_subunits,currency:policy.currency},notes:{ca_progress_policy_version_id:policy.id,ca_progress_plan_id:policy.plan_id,price_kind:'recurring'}})});assertProviderPlan(policy,plan);
      const verified=await rp(`plans/${encodeURIComponent(plan.id)}`);assertProviderPlan(policy,verified);
      const saved=await sql("UPDATE razorpay_plan_mappings SET provider_plan_id=?1,state='ready',provider_snapshot_json=?2,last_checked_at=?3,sync_token=NULL,lease_until=NULL,updated_at=?3 WHERE id=?4 AND sync_token=?5 AND EXISTS(SELECT 1 FROM plan_policy_versions WHERE id=?6 AND price_subunits=?7 AND currency=?8 AND billing_duration_value=?9 AND billing_duration_unit=?10)",[plan.id,JSON.stringify(verified),stamp,mappingId,leaseToken,policy.id,policy.price_subunits,policy.currency,policy.billing_duration_value,policy.billing_duration_unit]);
      if(Number(saved.meta?.changes)!==1)throw new Error('Policy changed during provider validation');
      evidence.push({tier:policy.tier_key,cycle:policy.billing_cycle,version:policy.version,result:'provisioned_and_validated'});
    }catch(error){await sql("UPDATE razorpay_plan_mappings SET state='failed',last_error='phase1_provider_validation_failed',sync_token=NULL,lease_until=NULL WHERE id=?1 AND sync_token=?2",[mappingId,leaseToken]);throw error;}
  }
  await mkdir('deployment-evidence/payment-system-p1',{recursive:true});await writeFile('deployment-evidence/payment-system-p1/provider-mappings.json',JSON.stringify({checked_at:stamp,policies:evidence,customer_subscriptions_mutated:0,policies_published:0},null,2));console.log(JSON.stringify({validated:evidence.length,customer_subscriptions_mutated:0}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
