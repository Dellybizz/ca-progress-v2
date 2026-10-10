import type {CheckoutView} from './checkout-engine.mjs';
export function monitorCheckout(options:{read:()=>Promise<CheckoutView|null>;reconcile:(view:CheckoutView)=>Promise<CheckoutView|null>;publish:(view:CheckoutView|null)=>void;onError:(error:unknown)=>void;canCheck?:()=>boolean;maxChecks?:number}):()=>void;
