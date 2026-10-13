import {quoteForMethod} from './payment-quote.mjs';
// An unpaid provider setup is not the student's current plan or active renewal.
export function hasEstablishedRecurring(subscription,currentPlanId,enabled=true){
 if(!enabled||!subscription||['created','cancelled','completed','expired'].includes(subscription.status))return false;
 if(['mismatch','disputed','refunded'].includes(subscription.financialState))return false;
 return Number(subscription.paidCount)>0||subscription.upgradeRenewalApproved===true||
  (subscription.planId===currentPlanId&&subscription.status==='active'&&Number(subscription.trialDays)>0);
}
export function checkoutRecoveryVisible(view,dismissedSubscriptionId=null){
 return Boolean(view&&!view.accessGranted&&!['failed','cancelled','succeeded'].includes(view.state)&&
  !(view.resumable&&view.providerStatus==='created')&&(!dismissedSubscriptionId||view.subscriptionId!==dismissedSubscriptionId));
}

// Compare annual billing with twelve regular monthly payments, excluding intro offers.
export function annualReferencePrice(monthly,annual){
 const reference=monthly*12;
 return Number.isSafeInteger(monthly)&&monthly>0&&Number.isSafeInteger(annual)&&annual>=0&&Number.isSafeInteger(reference)&&reference>annual?reference:null;
}

export function reviewCheckoutSelection(offer,method,{downgrade=false,priceApproval=false}={}){
 const singleMandate=!downgrade&&!priceApproval&&offer?.billingCycle==='monthly'&&offer?.upgradeIntroPriceSubunits!=null&&Boolean(offer.singleMandateMethods?.includes(method));
 const acceptRegularPriceFallback=singleMandate&&Boolean(offer.singleMandateFallbackMethods?.includes(method));
 const quote=quoteForMethod({recurring:offer?.recurringPriceSubunits??0,intro:singleMandate?offer.upgradeIntroPriceSubunits:offer?.introPriceSubunits,eligible:!downgrade&&!priceApproval&&(singleMandate||offer?.introEligible),trialDays:downgrade?0:offer?.trialDays},singleMandate?'upi':method);
 return {singleMandate,acceptRegularPriceFallback,quote};
}

// The current-plan overview must not inherit an unpaid or unrelated checkout.
export function billingOverviewSubscription(subscription,currentPlanId){
 if(!subscription||subscription.planId!==currentPlanId)return null;
 const established=Number(subscription.paidCount)>0||Boolean(subscription.paidThroughAt)||subscription.upgradeRenewalApproved===true||(subscription.status==='active'&&Number(subscription.trialDays)>0);
 return established?subscription:null;
}
