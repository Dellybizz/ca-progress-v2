import {CheckoutError} from './checkout-engine.mjs';
export async function priceApproval(db,user,input) {
 const row=await db.prepare(`SELECT j.*,s.gift_id,s.plan_id,s.billing_cycle,sp.tier_key,s.provider_subscription_id,s.provider_plan_id,s.paid_through_at,s.cancel_at_period_end,s.currency,s.financial_state,s.provider_verified,s.paid_count,sp.name plan_name,pv.price_subunits,pv.billing_duration_value,pv.billing_duration_unit,pv.grace_days,pv.published_at
 FROM subscription_policy_change_jobs j JOIN razorpay_subscriptions s ON s.id=j.source_subscription_id JOIN subscription_plans sp ON sp.id=s.plan_id JOIN plan_policy_versions pv ON pv.id=j.target_policy_id
 WHERE j.id=?1 AND j.user_id=?2 AND s.user_id=?2 AND j.kind='price_decrease' AND j.state='awaiting_approval'`).bind(input.priceChangeId,user).first();
 if(!row||row.financial_state!=='paid'||Number(row.provider_verified)!==1||Number(row.paid_count)<1||row.published_at==null||Number(row.price_subunits)!==Number(row.target_price_subunits)||row.plan_id!==input.planId||row.target_policy_id!==input.policyVersionId||Number(row.cancel_at_period_end)!==1)throw new CheckoutError('This lower-price approval is no longer available. Refresh Billing.','price_approval_unavailable');
 if((row.gift_id??null)!==(input.giftId??null))throw new CheckoutError('Keep the original gift owner and recipient for this approval.','price_approval_gift_mismatch');
 if(input.switchFromSubscriptionId||input.singleMandate||input.promoCode)throw new CheckoutError('Lower-price approval uses the published recurring price.','price_approval_terms_conflict');
 const availability=await db.prepare("SELECT mode FROM plan_availability_policies WHERE plan_id=?1").bind(row.plan_id).first();
 if(availability?.mode==='retire')throw new CheckoutError('This plan is being retired.','price_approval_plan_retired');
 return {...row,terms:{planId:row.plan_id,tierKey:row.tier_key,billingCycle:row.billing_cycle,name:row.plan_name,policyVersionId:row.target_policy_id,recurringPrice:Number(row.price_subunits),currency:row.currency,durationValue:Number(row.billing_duration_value),durationUnit:row.billing_duration_unit,trialDays:0,graceDays:row.billing_cycle==='annual'?10:3,introPrice:null,introCycles:0,introProviderOfferId:null,introOfferVerified:false,cancellationMode:'period_end'}};
}
