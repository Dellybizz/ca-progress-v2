// Razorpay requires a bounded mandate and documents a maximum of 100 years.
// New schedules represent ongoing renewal until cancellation; old contracts stay immutable.
export const MANDATE_SCHEDULE_VERSION='owner-long-running-v1';
export function mandateSchedule({billingCycle,durationValue=1,durationUnit}){
 const unit=durationUnit??(billingCycle==='monthly'?'month':'year');
 if(!['monthly','annual'].includes(billingCycle)||unit!==(billingCycle==='monthly'?'month':'year')||Number(durationValue)!==1)throw new Error('Choose monthly or yearly billing with interval one.');
 return {totalCount:billingCycle==='monthly'?1200:100,durationMonths:1200,scheduleVersion:MANDATE_SCHEDULE_VERSION,customerNotify:true,renewalOwner:'razorpay',freshAuthorizationAtEnd:true};
}
export function supportedMandate(local,providerCount=local.total_count){
 const months=Math.max(Number(local.total_count)||0,Number(providerCount)||0)*Number(local.billing_duration_value||1)*(local.billing_duration_unit==='year'?12:1);
 return months>0&&months<=(local.mandate_schedule_version===MANDATE_SCHEDULE_VERSION?1200:12);
}
