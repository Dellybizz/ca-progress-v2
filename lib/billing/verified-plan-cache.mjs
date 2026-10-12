// Cache only a recent provider-verified immutable Plan, never payment or access evidence.
export function verifiedPlanCacheMatches(row,{keyId,planId,amount,currency,period,interval,now=Date.now()}){
 try{
  const s=JSON.parse(row.provider_snapshot_json),age=now-Date.parse(row.last_checked_at);
  return age>=0&&age<300000&&s.keyId===keyId&&s.id===planId&&s.amount===amount&&s.currency===currency&&s.period===period&&s.interval===interval;
 }catch{return false;}
}
