export const MANDATE_SCHEDULE_VERSION='p3-one-year-v1';
export function mandateSchedule({billingCycle,durationValue=1,durationUnit}){
 const unit=durationUnit??(billingCycle==='monthly'?'month':'year'),months=unit==='year'?Number(durationValue)*12:Number(durationValue);
 if(!['monthly','annual'].includes(billingCycle)||unit!==(billingCycle==='monthly'?'month':'year')||!Number.isSafeInteger(months)||months<1||months>12||12%months!==0)throw new Error('The mandate must use a whole billing interval within one year.');
 return {totalCount:12/months,durationMonths:12,scheduleVersion:MANDATE_SCHEDULE_VERSION,customerNotify:true,renewalOwner:'razorpay',freshAuthorizationAtEnd:true};
}
