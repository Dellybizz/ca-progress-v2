// Pure policy calculations. Prices are integer subunits; timestamps are UTC.
const DAY=86400000;
const integer=(value,name)=>{if(!Number.isSafeInteger(value)||value<0)throw new Error(`Invalid ${name}`);return value;};
const timestamp=(value)=>{const result=Date.parse(value);if(!Number.isFinite(result))throw new Error('Invalid timestamp');return result;};
export const DEFAULT_SUBSCRIPTION_RULES=Object.freeze({version:1,accessGraceDays:3,storageGraceDays:10,importantStoragePercent:10,priceLockMonths:12});
export function priceLockEnd(start,months=12){integer(months,'lock duration');const result=new Date(timestamp(start)),day=result.getUTCDate();result.setUTCDate(1);result.setUTCMonth(result.getUTCMonth()+months);const last=new Date(Date.UTC(result.getUTCFullYear(),result.getUTCMonth()+1,0)).getUTCDate();result.setUTCDate(Math.min(day,last));return result.toISOString();}
export function upgradeQuote({now,periodStart,periodEnd,paidAmount,targetPrice,introPrice=null,introEligible=false,currency='INR',policyVersionId,priceLockMonths=12,applyBasicCredit=false}){
  const start=timestamp(periodStart),end=timestamp(periodEnd),at=timestamp(now);if(end<=start||at<start||at>=end)throw new Error('No remaining verified paid period');
  integer(paidAmount,'paid amount');integer(targetPrice,'target price');if(introPrice!==null){integer(introPrice,'intro price');if(introPrice>targetPrice)throw new Error('Intro exceeds recurring price');}
  const remaining=end-at,duration=end-start,credit=applyBasicCredit?Number(BigInt(paidAmount)*BigInt(remaining)/BigInt(duration)):0,offer=introEligible&&introPrice!==null;
  const price=offer?introPrice:Number((BigInt(targetPrice)*BigInt(remaining)+BigInt(duration)-1n)/BigInt(duration));
  const due=Math.max(0,price-credit),renewal=offer?priceLockEnd(now,1):new Date(end).toISOString();
  return {basicCreditApplied:applyBasicCredit,currency,policyVersionId,mode:offer?'intro_full_month':'remaining_paid_period',planChargeSubunits:price,unusedCreditSubunits:credit,amountDueSubunits:due,recurringPriceSubunits:targetPrice,effectiveAt:new Date(at).toISOString(),nextRenewalAt:renewal,priceLockedUntil:priceLockEnd(now,priceLockMonths),unusedCreditExceedsCharge:credit>price};
}
export function grantSchedule({now,durationSeconds,paidThroughAt,activeGrantEndAt=null}){
  integer(durationSeconds,'grant duration');if(durationSeconds===0)throw new Error('Grant duration is required');const at=timestamp(now),starts=activeGrantEndAt?Math.max(at,timestamp(activeGrantEndAt)):at,end=starts+durationSeconds*1000;
  const paid=paidThroughAt?timestamp(paidThroughAt):at;
  return {startsAt:new Date(starts).toISOString(),endsAt:new Date(end).toISOString(),renewalAt:new Date(Math.max(at,paid)+durationSeconds*1000).toISOString(),queued:starts>at};
}
export function firstPaidOfferEligible({tier,verifiedPurchases}){return !verifiedPurchases.some(p=>p.tier===tier&&p.captured===true);}
export function grantAudienceEligible({audience,previousClaims}){if(!['everyone','never_claimed'].includes(audience))throw new Error('Invalid audience');return audience==='everyone'||previousClaims===0;}
export function storageCleanup({files,limitBytes,importantPercent=10,effectiveAt,now,graceDays=10}){
  integer(limitBytes,'storage limit');integer(importantPercent,'important allowance');integer(graceDays,'storage grace');
  const allowance=Math.floor(limitBytes*importantPercent/100),deadline=timestamp(effectiveAt)+graceDays*DAY;
  const normalized=files.map(file=>({...file,sizeBytes:integer(file.sizeBytes,'file size'),created:timestamp(file.createdAt)}));
  const used=normalized.reduce((total,f)=>total+f.sizeBytes,0);let remaining=used,important=normalized.filter(f=>f.important).reduce((total,f)=>total+f.sizeBytes,0);const remove=[];
  const fits=()=>remaining<=limitBytes+Math.min(important,allowance);
  // Ties are deterministic across retries. Never use storage-provider listing order.
  const newest=(a,b)=>b.created-a.created||String(b.id).localeCompare(String(a.id));
  for(const file of [...normalized.filter(f=>!f.important).sort(newest),...normalized.filter(f=>f.important).sort(newest)]){if(fits())break;remove.push(file.id);remaining-=file.sizeBytes;if(file.important)important-=file.sizeBytes;}
  return {usedBytes:used,limitBytes,importantAllowanceBytes:allowance,deadline:new Date(deadline).toISOString(),overLimit:!((used<=limitBytes+Math.min(normalized.filter(f=>f.important).reduce((n,f)=>n+f.sizeBytes,0),allowance))),previewDeleteIds:remove,deleteIds:timestamp(now)>=deadline?remove:[],remainingBytes:remaining};
}
export function duplicatePaymentDecision({winningPaymentId,paymentId,verified,captured,amountMatches,currencyMatches,ownerMatches,purchaseMatches}){
  if(!(verified&&captured&&amountMatches&&currencyMatches&&ownerMatches&&purchaseMatches))return 'reject';
  if(!winningPaymentId)return 'claim_winner';return winningPaymentId===paymentId?'already_applied':'refund_duplicate';
}
