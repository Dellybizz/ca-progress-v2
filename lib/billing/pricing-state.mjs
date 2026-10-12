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
