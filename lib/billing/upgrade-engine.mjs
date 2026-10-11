// All monetary actions use immutable server quotes and fresh provider evidence.
import {upgradeQuote,priceLockEnd} from './subscription-rules.mjs';
import {CheckoutError} from './checkout-engine.mjs';
const stamp=()=>new Date().toISOString();
const fail=(message,code='upgrade_pending',status=409)=>{throw new CheckoutError(message,code,status);};
const owned=(db,user,id)=>db.prepare('SELECT u.*,g.plan_id,g.policy_snapshot_json,g.quoted_amount_subunits,g.currency,g.winning_payment_id FROM subscription_upgrades u JOIN subscription_purchase_groups g ON g.id=u.purchase_group_id WHERE u.purchase_group_id=?1 AND u.user_id=?2').bind(id,user).first();
const snapshot=row=>{const value=JSON.parse(row.policy_snapshot_json);if(value.kind==='intro'&&row.access_starts_at&&row.access_ends_at)value.quote={...value.quote,effectiveAt:row.access_starts_at,nextRenewalAt:row.access_ends_at,priceLockedUntil:priceLockEnd(row.access_starts_at,value.priceLockMonths)};return value;};
async function verifyIntroEligibility(db,user,ownId=null,tier='pro'){
 if(!await tierOfferEligible(db,user,tier))fail('Your first-month offer for this plan has already been used. Choose the regular subscription.','upgrade_offer_used');
 const open=await db.prepare("SELECT 1 FROM razorpay_subscriptions WHERE user_id=?1 AND status IN ('created','authenticated','active','pending','halted','paused') LIMIT 1").bind(user).first();
 const paid=await db.prepare("SELECT 1 FROM user_subscriptions WHERE user_id=?1 AND source='razorpay' AND status='active' AND ends_at>?2 LIMIT 1").bind(user,stamp()).first();
 const attempt=await db.prepare("SELECT 1 FROM payment_checkout_attempts a LEFT JOIN razorpay_subscriptions rs ON rs.provider_subscription_id=a.provider_subscription_id WHERE a.user_id=?1 AND a.state IN ('reserved','preparing','dispatching','uncertain','provider_created','ready','pending') AND (rs.provider_subscription_id IS NULL OR rs.status NOT IN ('cancelled','completed','expired')) LIMIT 1").bind(user).first();
 const saved=await db.prepare("SELECT 1 FROM subscription_upgrades WHERE user_id=?1 AND purchase_group_id<>COALESCE(?2,'') AND state NOT IN ('completed','failed') LIMIT 1").bind(user,ownId).first();
 if(open||paid||saved||attempt)fail('Continue your existing checkout or manage your current subscription before starting another subscription.','intro_existing_subscription');
}
export async function saveIntroQuote(db,user,target,renewalPaymentMethod='upi'){
 const plan=await db.prepare('SELECT tier_key,billing_cycle,currency FROM subscription_plans WHERE id=?1').bind(target.planId).first();
 if(!plan||!['basic','pro'].includes(plan.tier_key)||plan.billing_cycle!=='monthly'||plan.currency!==target.currency)fail('Choose a supported monthly plan.','intro_plan_unavailable');
 await verifyIntroEligibility(db,user,null,plan.tier_key);
 const [policy,offer]=await Promise.all([db.prepare("SELECT * FROM subscription_lifecycle_policies WHERE state='published' ORDER BY version DESC LIMIT 1").first(),db.prepare("SELECT * FROM subscription_upgrade_offers WHERE plan_id=?1 AND state='published'").bind(target.planId).first()]);
 if(!policy||!offer||offer.currency!==target.currency||Number(offer.intro_price_subunits)<100||Number(offer.intro_price_subunits)>target.recurringPriceSubunits)fail('The first-month offer is currently unavailable.','intro_offer_unavailable');
 const now=stamp(),quoteId=crypto.randomUUID(),expiresAt=new Date(Date.parse(now)+300000).toISOString(),amount=Number(offer.intro_price_subunits);
 const quote={currency:target.currency,policyVersionId:target.policyVersionId,mode:'intro_full_month',planChargeSubunits:amount,unusedCreditSubunits:0,amountDueSubunits:amount,recurringPriceSubunits:target.recurringPriceSubunits,effectiveAt:now,nextRenewalAt:priceLockEnd(now,1),priceLockedUntil:priceLockEnd(now,Number(policy.price_lock_months)),unusedCreditExceedsCharge:false};
 const value={kind:'intro',targetTier:plan.tier_key,version:1,renewalPaymentMethod,lifecyclePolicyId:policy.id,priceLockMonths:Number(policy.price_lock_months),offerVersion:offer.version,quote,expiresAt,targetPlanId:target.planId};
 await db.prepare("INSERT INTO subscription_purchase_groups(id,user_id,plan_id,policy_snapshot_json,quoted_amount_subunits,currency,state) VALUES(?1,?2,?3,?4,?5,?6,'open')").bind(quoteId,user,target.planId,JSON.stringify(value),amount,target.currency).run();
 return {kind:'intro',quoteId,expiresAt,quote,checkoutReady:true};
}
export const VERIFIED_BASIC_PERIOD_SQL=`SELECT c.*,s.provider_subscription_id,s.plan_id,s.cancel_at_period_end FROM payment_subscription_cycles c
 JOIN razorpay_subscriptions s ON s.id=c.razorpay_subscription_id
 JOIN subscription_plans p ON p.id=s.plan_id
 JOIN razorpay_subscription_charges ch ON ch.provider_payment_id=c.provider_payment_id AND ch.razorpay_subscription_id=s.id
 WHERE s.user_id=?1 AND p.tier_key='basic' AND s.billing_cycle='monthly' AND s.financial_state='paid'
 AND c.status='verified' AND c.provider_mode='live' AND c.verified_at IS NOT NULL AND c.starts_at<=?2 AND c.ends_at>?2
 AND ch.status='captured' AND ch.refund_state='none' AND ch.dispute_state='none'
 AND ch.amount_subunits=c.amount_subunits AND ch.currency=c.currency AND c.currency='INR'
 ORDER BY c.ends_at DESC LIMIT 1`;
export async function proOfferEligible(db,user){return tierOfferEligible(db,user,'pro');}
export async function tierOfferEligible(db,user,tier){
 const prior=await db.prepare(`SELECT 1 paid FROM user_subscriptions us JOIN subscription_plans p ON p.id=us.plan_id
 WHERE us.user_id=?1 AND p.tier_key=?2 AND us.source='razorpay' AND us.source_payment_id IS NOT NULL
 UNION ALL SELECT 1 FROM payment_orders po JOIN subscription_plans p ON p.id=po.plan_id
 WHERE po.user_id=?1 AND p.tier_key=?2 AND po.status='paid'
 UNION ALL SELECT 1 FROM payment_subscription_cycles c JOIN razorpay_subscriptions s ON s.id=c.razorpay_subscription_id
 JOIN subscription_plans p ON p.id=s.plan_id WHERE s.user_id=?1 AND p.tier_key=?2 AND c.status IN ('verified','refunded')
 UNION ALL SELECT 1 FROM subscription_purchase_groups g JOIN subscription_plans p ON p.id=g.plan_id
 WHERE g.user_id=?1 AND p.tier_key=?2 AND g.winning_payment_id IS NOT NULL LIMIT 1`).bind(user,tier).first();
 return !prior;
}
export async function saveUpgradeQuote(db,user,target,renewalPaymentMethod='upi'){
 const now=stamp(),period=await db.prepare(VERIFIED_BASIC_PERIOD_SQL).bind(user,now).first();
 if(!period)fail('A verified current Basic payment is required to calculate unused credit.','upgrade_paid_period_required');
 if(Date.parse(period.ends_at)-Date.parse(now)<300000)fail('Your renewal is very close. Please try upgrading after it finishes.','upgrade_renewal_too_close');
 const [policy,offer,eligible]=await Promise.all([
  db.prepare("SELECT * FROM subscription_lifecycle_policies WHERE state='published' ORDER BY version DESC LIMIT 1").first(),
  db.prepare("SELECT * FROM subscription_upgrade_offers WHERE plan_id=?1 AND state='published'").bind(target.planId).first(),proOfferEligible(db,user)]);
 if(!policy)fail('Upgrade terms are unavailable.','upgrade_policy_missing',503);
 const quote=upgradeQuote({now,periodStart:period.starts_at,periodEnd:period.ends_at,paidAmount:Number(period.amount_subunits),targetPrice:target.recurringPriceSubunits,introPrice:offer?.currency===target.currency?Number(offer.intro_price_subunits):null,introEligible:eligible,currency:target.currency,policyVersionId:target.policyVersionId,priceLockMonths:Number(policy.price_lock_months)});
 if(quote.unusedCreditExceedsCharge)fail('Your unused credit needs review before this upgrade.','upgrade_credit_review');
 // Never increase the charge to a gateway minimum or silently discard credit.
 if(quote.amountDueSubunits>0&&quote.amountDueSubunits<100)fail('The remaining upgrade amount is below the payment minimum. Try again after renewal.','upgrade_below_payment_minimum');
 const quoteId=crypto.randomUUID(),expiresAt=new Date(Date.parse(now)+300000).toISOString();
 const value={kind:'upgrade',version:1,renewalPaymentMethod,lifecyclePolicyId:policy.id,offerVersion:offer?.version??null,quote,expiresAt,sourceSubscriptionId:period.provider_subscription_id,sourceInvoiceId:period.provider_invoice_id,sourcePaymentId:period.provider_payment_id,sourcePlanId:period.plan_id,targetPlanId:target.planId,sourcePeriodStart:period.starts_at,sourcePeriodEnd:period.ends_at};
 await db.prepare("INSERT INTO subscription_purchase_groups(id,user_id,plan_id,policy_snapshot_json,quoted_amount_subunits,currency,state) VALUES(?1,?2,?3,?4,?5,?6,'open')").bind(quoteId,user,target.planId,JSON.stringify(value),quote.amountDueSubunits,quote.currency).run();
 return {quoteId,expiresAt,quote,checkoutReady:true};
}
async function lease(db,row,run){
 const token=crypto.randomUUID(),time=stamp();
 const claim=await db.prepare('UPDATE subscription_upgrades SET lease_token=?1,lease_until=?2 WHERE purchase_group_id=?3 AND (lease_token IS NULL OR lease_until<=?4)').bind(token,new Date(Date.now()+300000).toISOString(),row.purchase_group_id,time).run();
 if(Number(claim.meta?.changes)!==1)fail('Your upgrade is being checked. Please try again shortly.','upgrade_busy',202);
 try{return await run();}finally{await db.prepare('UPDATE subscription_upgrades SET lease_token=NULL,lease_until=NULL WHERE purchase_group_id=?1 AND lease_token=?2').bind(row.purchase_group_id,token).run();}
}
export function matchesUpgradeOrder(row,order){const s=snapshot(row),notes=order.notes??{};return /^order_[A-Za-z0-9]+$/.test(String(order.id))&&order.receipt===row.receipt&&Number(order.amount)===Number(row.quoted_amount_subunits)&&order.currency===row.currency&&notes.ca_progress_user_id===row.user_id&&notes.ca_progress_purchase_group_id===row.purchase_group_id&&notes.ca_progress_policy_version_id===s.quote.policyVersionId&&order.partial_payment!==true;}
async function verifySource(row,deps){
 if(snapshot(row).kind==='intro')return;
 const s=snapshot(row),[subscription,invoice,payment]=await Promise.all([deps.provider(`subscriptions/${s.sourceSubscriptionId}`),deps.provider(`invoices/${s.sourceInvoiceId}`),deps.provider(`payments/${s.sourcePaymentId}`)]);
 if(subscription.id!==s.sourceSubscriptionId||subscription.notes?.ca_progress_user_id!==row.user_id||!['active','cancelled'].includes(subscription.status)||invoice.id!==s.sourceInvoiceId||invoice.subscription_id!==s.sourceSubscriptionId||invoice.payment_id!==s.sourcePaymentId||payment.id!==s.sourcePaymentId||payment.invoice_id!==s.sourceInvoiceId||payment.status!=='captured'||Number(payment.amount_refunded??0)!==0||payment.currency!==row.currency||Number(invoice.amount_paid)!==Number(payment.amount)||invoice.status!=='paid'||Number(invoice.amount_due)!==0||new Date(Number(invoice.billing_start)*1000).toISOString()!==s.sourcePeriodStart||new Date(Number(invoice.billing_end)*1000).toISOString()!==s.sourcePeriodEnd)fail('Your original payment needs verification before upgrading.','upgrade_source_mismatch');
 const q=upgradeQuote({now:s.quote.effectiveAt,periodStart:s.sourcePeriodStart,periodEnd:s.sourcePeriodEnd,paidAmount:Number(payment.amount),targetPrice:s.quote.recurringPriceSubunits,introPrice:s.quote.mode==='intro_full_month'?s.quote.planChargeSubunits:null,introEligible:s.quote.mode==='intro_full_month',currency:row.currency,policyVersionId:s.quote.policyVersionId});
 if(q.amountDueSubunits!==Number(row.quoted_amount_subunits)||q.unusedCreditSubunits!==s.quote.unusedCreditSubunits)fail('Your original paid credit has changed. Refresh your upgrade review.','upgrade_credit_mismatch');
}
export async function acceptUpgrade(db,user,id,deps){
 let row=await owned(db,user,id);
 if(!row){
  const group=await db.prepare("SELECT * FROM subscription_purchase_groups WHERE id=?1 AND user_id=?2 AND state='open'").bind(id,user).first();if(!group)fail('Upgrade quote not found.','upgrade_not_found',404);
  const s=snapshot(group);if(!['upgrade','intro'].includes(s.kind)||Date.parse(s.expiresAt)<=Date.now())fail('Your price review expired. Review your upgrade again.','upgrade_quote_expired');
  if(s.kind==='upgrade'&&Date.parse(s.sourcePeriodEnd)<=Date.now())fail('Your original paid period has ended. Refresh your upgrade review.','upgrade_period_ended');
  if(s.quote.mode==='intro_full_month'&&!await tierOfferEligible(db,user,s.targetTier??'pro'))fail('Your introductory offer has already been used. Refresh your review.','upgrade_offer_used');
  if(s.kind==='intro')await verifyIntroEligibility(db,user,id,s.targetTier??'pro');
  const candidate={...group,purchase_group_id:id,receipt:`up_${id.replaceAll('-','')}`,replacement_request_id:crypto.randomUUID()};
  await verifySource(candidate,deps);
  await db.prepare("INSERT OR IGNORE INTO subscription_upgrades(purchase_group_id,user_id,source_subscription_id,source_invoice_id,state,receipt,replacement_request_id,updated_at,kind) VALUES(?1,?2,?3,?4,'accepted',?5,?6,?7,?8)").bind(id,user,s.sourceSubscriptionId??null,s.sourceInvoiceId??null,candidate.receipt,candidate.replacement_request_id,stamp(),s.kind).run();
  row=await owned(db,user,id);if(!row)fail('Continue your saved upgrade before starting another.','upgrade_existing');
 }
 return lease(db,row,async()=>{
  row=await owned(db,user,id);if(row.provider_order_id||row.winning_payment_id)return upgradeView(db,row,deps);
  if(['dispatching','uncertain'].includes(row.state)){
   const result=await deps.provider(`orders?receipt=${encodeURIComponent(row.receipt)}&count=100`);
   if(!Array.isArray(result.items)||result.items.length>=100)fail('Your saved payment is still being checked.','upgrade_inventory_pending',202);
   const matches=result.items.filter(order=>matchesUpgradeOrder(row,order));
   if(matches.length!==1)fail('Your saved payment is still being checked.','upgrade_inventory_pending',202);
   await db.prepare("UPDATE subscription_upgrades SET provider_order_id=?1,state='ready',last_error=NULL,updated_at=?2 WHERE purchase_group_id=?3").bind(matches[0].id,stamp(),id).run();
  }else if(Number(row.quoted_amount_subunits)===0){
   await verifySource(row,deps);await activateUpgrade(db,row,`credit_${snapshot(row).sourcePaymentId}`,deps);
  }else{
   if(Date.parse(snapshot(row).expiresAt)<=Date.now()){await db.prepare("UPDATE subscription_upgrades SET state='failed',last_error='upgrade_quote_expired',updated_at=?1 WHERE purchase_group_id=?2 AND provider_order_id IS NULL").bind(stamp(),id).run();fail('Your price review expired. Review your upgrade again.','upgrade_quote_expired');}
   if(snapshot(row).kind==='intro')await verifyIntroEligibility(db,user,id,snapshot(row).targetTier??'pro');
   await db.prepare("UPDATE subscription_upgrades SET state='dispatching',updated_at=?1 WHERE purchase_group_id=?2").bind(stamp(),id).run();
   try{
    const order=await deps.provider('orders',{method:'POST',body:JSON.stringify({amount:Number(row.quoted_amount_subunits),currency:row.currency,receipt:row.receipt,partial_payment:false,notes:{ca_progress_user_id:user,ca_progress_purchase_group_id:id,ca_progress_policy_version_id:snapshot(row).quote.policyVersionId}})});
    if(!matchesUpgradeOrder(row,order))fail('Payment creation is awaiting confirmation.','upgrade_order_mismatch');
    await db.prepare("UPDATE subscription_upgrades SET provider_order_id=?1,state='ready',last_error=NULL,updated_at=?2 WHERE purchase_group_id=?3").bind(order.id,stamp(),id).run();
   }catch(error){await db.prepare("UPDATE subscription_upgrades SET state=?1,last_error=?2,updated_at=?3 WHERE purchase_group_id=?4").bind(error.definitiveRejection?'failed':'uncertain',error.code??'upgrade_order_pending',stamp(),id).run();throw error;}
  }
  return upgradeView(db,await owned(db,user,id),deps);
 });
}
async function activateUpgrade(db,row,paymentId,deps){
 const s=snapshot(row),q=s.quote,accessId=`upgrade_${row.purchase_group_id}`,time=stamp();
 // Winner claim and access writes are one D1 transaction. Retries never extend dates.
 const writes=[db.prepare("UPDATE subscription_purchase_groups SET winning_payment_id=?1,state='paid' WHERE id=?2 AND winning_payment_id IS NULL").bind(paymentId,row.purchase_group_id),
 db.prepare("UPDATE subscription_upgrades SET access_starts_at=COALESCE(access_starts_at,?1),access_ends_at=COALESCE(access_ends_at,?2) WHERE purchase_group_id=?3 AND kind='intro' AND EXISTS(SELECT 1 FROM subscription_purchase_groups WHERE id=?3 AND winning_payment_id=?4)").bind(time,priceLockEnd(time,1),row.purchase_group_id,paymentId),
 db.prepare(`INSERT OR IGNORE INTO user_subscriptions(id,user_id,plan_id,status,starts_at,ends_at,source,source_order_id,source_payment_id,created_at,updated_at)
 SELECT ?1,?2,?3,'active',COALESCE(u.access_starts_at,?4),COALESCE(u.access_ends_at,?5),'razorpay',?6,?7,?8,?8 FROM subscription_purchase_groups g JOIN subscription_upgrades u ON u.purchase_group_id=g.id WHERE g.id=?9 AND g.winning_payment_id=?7`).bind(accessId,row.user_id,row.plan_id,q.effectiveAt,q.nextRenewalAt,row.provider_order_id??row.purchase_group_id,paymentId,time,row.purchase_group_id),
 db.prepare(`INSERT OR IGNORE INTO subscription_policy_contracts(subscription_id,policy_version_id,grandfathered,decision_reason)
 SELECT ?1,?2,1,'Verified upgrade quote with actual unused payment credit' FROM user_subscriptions WHERE id=?1`).bind(accessId,q.policyVersionId),
 db.prepare("UPDATE subscription_upgrades SET state=CASE WHEN state IN ('completed','renewal_ready') THEN state ELSE 'paid' END,activated_at=COALESCE(activated_at,?1),updated_at=?1 WHERE purchase_group_id=?2 AND EXISTS(SELECT 1 FROM subscription_purchase_groups WHERE id=?2 AND winning_payment_id=?3)").bind(time,row.purchase_group_id,paymentId)];
 writes.push(db.prepare(`INSERT OR IGNORE INTO subscription_events(id,subscription_id,user_id,plan_id,payment_event_id,event_type,source,starts_at,ends_at,metadata,created_at)
 SELECT ?1,id,user_id,plan_id,NULL,'granted','payment',starts_at,ends_at,?2,?3 FROM user_subscriptions WHERE id=?4`).bind(`upgrade_event_${row.purchase_group_id}`,JSON.stringify({purchase_group_id:row.purchase_group_id,unusedCreditSubunits:q.unusedCreditSubunits}),time,accessId));
 const results=await db.batch(writes);if(results.some(r=>r.success===false))fail('Payment is received; access is being confirmed.','upgrade_activation_pending',503);
 const winner=await owned(db,row.user_id,row.purchase_group_id);
 if(winner.winning_payment_id!==paymentId){
  await db.prepare("INSERT OR IGNORE INTO subscription_refund_obligations(payment_id,purchase_group_id,amount_subunits,currency,state,request_key) VALUES(?1,?2,?3,?4,'pending',?5)").bind(paymentId,row.purchase_group_id,Number(row.quoted_amount_subunits),row.currency,`duplicate_${paymentId}`).run();
  return;
 }
 // Never create a replacement mandate until cancellation of the old one is confirmed.
 await cancelSource(db,winner,deps);
}
async function cancelSource(db,row,deps){
 if(row.source_cancelled_at)return;
 if(snapshot(row).kind==='intro'){await db.prepare('UPDATE subscription_upgrades SET source_cancelled_at=COALESCE(source_cancelled_at,?1) WHERE purchase_group_id=?2').bind(stamp(),row.purchase_group_id).run();return;}
 const id=row.source_subscription_id,sub=await deps.provider(`subscriptions/${id}`);
 if(sub.id!==id||sub.notes?.ca_progress_user_id!==row.user_id)fail('Your previous renewal needs review.','upgrade_source_owner_mismatch');
 if(!['cancelled','completed','expired'].includes(sub.status))await deps.provider(`subscriptions/${id}/cancel`,{method:'POST',body:JSON.stringify({cancel_at_cycle_end:0})});
 const confirmed=await deps.provider(`subscriptions/${id}`);if(confirmed.id!==id||!['cancelled','completed','expired'].includes(confirmed.status))fail('Your upgrade is active. Previous renewal cancellation is being confirmed.','upgrade_cancellation_pending',202);
 const time=stamp();await db.batch([
 db.prepare('UPDATE subscription_upgrades SET source_cancelled_at=?1,last_error=NULL,updated_at=?1 WHERE purchase_group_id=?2').bind(time,row.purchase_group_id),
 db.prepare("UPDATE razorpay_subscriptions SET status='cancelled',cancel_at_period_end=0,provider_verified=1,provider_state_json=?1,updated_at=?2 WHERE provider_subscription_id=?3 AND user_id=?4").bind(JSON.stringify(confirmed),time,id,row.user_id)]);
}
export async function verifyUpgradePayment(db,row,paymentId,deps){
 const [order,payment]=await Promise.all([deps.provider(`orders/${row.provider_order_id}`),deps.provider(`payments/${paymentId}`)]);
 if(!matchesUpgradeOrder(row,order)||payment.id!==paymentId||payment.order_id!==row.provider_order_id||Number(payment.amount)!==Number(row.quoted_amount_subunits)||payment.currency!==row.currency||payment.status!=='captured'||Number(payment.amount_refunded??0)!==0)fail('Payment is still being verified. Your current access is preserved.','upgrade_payment_pending',202);
 await db.prepare(`INSERT INTO subscription_upgrade_payments(payment_id,purchase_group_id,provider_order_id,amount_subunits,currency,status,provider_created_at,verified_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
 ON CONFLICT(payment_id) DO UPDATE SET status=excluded.status,verified_at=excluded.verified_at`).bind(paymentId,row.purchase_group_id,row.provider_order_id,payment.amount,payment.currency,payment.status,new Date(Number(payment.created_at)*1000).toISOString(),stamp()).run();
 if(snapshot(row).kind==='intro'&&!row.winning_payment_id){
  try{await verifyIntroEligibility(db,row.user_id,row.purchase_group_id,snapshot(row).targetTier??'pro');}catch(error){
   // A purchase that loses eligibility after dispatch is refunded, never granted twice.
   await db.batch([
    db.prepare("INSERT OR IGNORE INTO subscription_refund_obligations(payment_id,purchase_group_id,amount_subunits,currency,state,request_key) VALUES(?1,?2,?3,?4,'pending',?5)").bind(paymentId,row.purchase_group_id,Number(row.quoted_amount_subunits),row.currency,`intro_conflict_${paymentId}`),
    db.prepare("UPDATE subscription_upgrades SET state='review',last_error=?1,updated_at=?2 WHERE purchase_group_id=?3").bind(error.code??'intro_conflict',stamp(),row.purchase_group_id)
   ]);return upgradeView(db,await owned(db,row.user_id,row.purchase_group_id),deps);
  }
 }
 await verifySource(row,deps);
 await activateUpgrade(db,row,paymentId,deps);
 return upgradeView(db,await owned(db,row.user_id,row.purchase_group_id),deps);
}
export async function upgradeView(db,row,deps){
 const q=snapshot(row).quote;
 const access=await db.prepare("SELECT id FROM user_subscriptions WHERE id=?1 AND user_id=?2 AND status='active' AND starts_at<=?3 AND ends_at>?3").bind(`upgrade_${row.purchase_group_id}`,row.user_id,stamp()).first();
 return {planLabel:snapshot(row).targetTier==='basic'?'Basic':'Pro',kind:snapshot(row).kind,quoteId:row.purchase_group_id,planId:row.plan_id,quote:q,state:row.state,orderId:row.provider_order_id,keyId:deps.keyId,accessGranted:Boolean(access&&row.winning_payment_id&&row.activated_at&&row.state!=='review'),renewalReady:Boolean(row.replacement_subscription_id&&row.state==='completed'),sourceCancelled:Boolean(row.source_cancelled_at),replacementSubscriptionId:row.replacement_subscription_id,errorCode:row.last_error};
}
export async function recoverUpgrade(db,user,id,deps){
 const row=await owned(db,user,id);if(!row)fail('Upgrade not found.','upgrade_not_found',404);
 return lease(db,row,async()=>{
  if(row.provider_order_id){
   const list=await deps.provider(`orders/${row.provider_order_id}/payments`);
   if(!Array.isArray(list.items))fail('Your payment is still being checked.','upgrade_payment_pending',202);
   for(const payment of list.items.filter(p=>p.status==='captured'&&p.id!==row.winning_payment_id&&Number(p.amount_refunded??0)===0))await verifyUpgradePayment(db,row,payment.id,deps);
  }
  const latest=await owned(db,user,id);if(latest.winning_payment_id)await cancelSource(db,latest,deps);
  return upgradeView(db,await owned(db,user,id),deps);
 });
}
export async function latestUpgrade(db,user){return db.prepare("SELECT purchase_group_id FROM subscription_upgrades WHERE user_id=?1 AND state NOT IN ('completed','failed') ORDER BY updated_at DESC LIMIT 1").bind(user).first();}
export async function upgradeByOrder(db,id){return db.prepare('SELECT u.*,g.plan_id,g.policy_snapshot_json,g.quoted_amount_subunits,g.currency,g.winning_payment_id FROM subscription_upgrades u JOIN subscription_purchase_groups g ON g.id=u.purchase_group_id WHERE u.provider_order_id=?1').bind(id).first();}
export {owned as ownedUpgrade,snapshot as upgradeSnapshot};
