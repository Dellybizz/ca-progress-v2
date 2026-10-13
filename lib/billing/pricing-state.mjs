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
