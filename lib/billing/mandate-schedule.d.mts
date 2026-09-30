export const MANDATE_SCHEDULE_VERSION:string;
export function mandateSchedule(input:{billingCycle:string;durationValue?:number;durationUnit?:string}):{totalCount:number;durationMonths:number;scheduleVersion:string;customerNotify:boolean;renewalOwner:string;freshAuthorizationAtEnd:boolean};
