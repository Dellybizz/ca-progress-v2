// Razorpay Plans cannot be edited or deleted. Reuse exact verified terms for the same API key; never cache payment/access evidence.
export function verifiedPlanCacheMatches(row,{keyId,planId,amount,currency,period,interval,now=Date.now()}){
 try{
  const s=JSON.parse(row.provider_snapshot_json),age=now-Date.parse(row.last_checked_at);
  return age>=0&&Number.isFinite(age)&&s.keyId===keyId&&s.id===planId&&s.amount===amount&&s.currency===currency&&s.period===period&&s.interval===interval;
 }catch{return false;}
}
