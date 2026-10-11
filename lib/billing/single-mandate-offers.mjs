import {tierOfferEligible} from './upgrade-engine.mjs';
export function mandateOfferMatches(binding,terms,intro,method){
 return Boolean(binding&&['upi','card'].includes(method)&&binding.payment_method===method&&binding.plan_id===terms.planId&&binding.policy_version_id===terms.policyVersionId&&/^offer_[A-Za-z0-9]+$/.test(binding.provider_offer_id)&&binding.verified_at&&binding.currency===terms.currency&&Number(binding.intro_price_subunits)===Number(intro)&&Number(binding.recurring_price_subunits)===terms.recurringPrice);
}
export async function singleMandateTerms(db,user,terms,method){
 if(terms.billingCycle!=='monthly'||Number(terms.durationValue??1)!==1||Number(terms.trialDays??0)!==0||!['upi','card'].includes(method))return null;
 const offer=await db.prepare("SELECT intro_price_subunits,currency FROM subscription_upgrade_offers WHERE plan_id=?1 AND state='published'").bind(terms.planId).first();
 if(!offer||offer.currency!==terms.currency||!await tierOfferEligible(db,user,terms.tierKey))return null;
 const binding=await db.prepare('SELECT * FROM subscription_mandate_offers WHERE plan_id=?1 AND payment_method=?2').bind(terms.planId,method).first();
 if(!mandateOfferMatches(binding,terms,offer.intro_price_subunits,method))return null;
 return {...terms,introPrice:Number(offer.intro_price_subunits),introCycles:1,introProviderOfferId:binding.provider_offer_id,introOfferVerified:true,allowRegularPriceFallback:Number(binding.allow_regular_price_fallback)===1};
}
