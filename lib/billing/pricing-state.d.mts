import type {RecurringSubscriptionView} from './recurring-service';
import type {CheckoutView} from './checkout-engine.mjs';
export function hasEstablishedRecurring(subscription:RecurringSubscriptionView|null,currentPlanId:string|null,enabled?:boolean):boolean;
export function checkoutRecoveryVisible(view:CheckoutView|null,dismissedSubscriptionId?:string|null):boolean;

export function annualReferencePrice(monthly:number,annual:number):number|null;
