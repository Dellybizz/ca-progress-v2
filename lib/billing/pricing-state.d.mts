import type {RecurringSubscriptionView} from './recurring-service';
import type {CheckoutView} from './checkout-engine.mjs';
export function hasEstablishedRecurring(subscription:RecurringSubscriptionView|null,currentPlanId:string|null,enabled?:boolean):boolean;
export function checkoutRecoveryVisible(view:CheckoutView|null,dismissedSubscriptionId?:string|null):boolean;

export function annualReferencePrice(monthly:number,annual:number):number|null;

export function reviewCheckoutSelection(offer:import('./commercial-policy').PublishedPricingOffer|undefined,method:import('./payment-quote.mjs').PaymentMethod,context?:{downgrade?:boolean;priceApproval?:boolean}):{singleMandate:boolean;acceptRegularPriceFallback:boolean;quote:ReturnType<typeof import('./payment-quote.mjs').quoteForMethod>};
