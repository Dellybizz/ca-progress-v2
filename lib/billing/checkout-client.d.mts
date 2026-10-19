import type {CheckoutInput} from './checkout-engine.mjs';
type Storage={getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void};
export function readCheckoutIntent(storage:Storage,user:string):CheckoutInput|null;
export function checkoutIntent(storage:Storage,user:string,terms:Omit<CheckoutInput,'requestId'>,uuid:()=>string):CheckoutInput;
export function clearCheckoutIntent(storage:Storage,user:string,requestId:string):void;

export function adoptCheckoutRequest(storage:Storage,user:string,requestId:string):void;

export function checkoutIntentForPurchase(storage:Storage,user:string,terms:Omit<CheckoutInput,'requestId'>,uuid:()=>string,readStatus?:()=>Promise<{requestId:string;state:string;attemptId?:string;accessGranted?:boolean;planId?:string;paymentMethod?:string}|null>):Promise<CheckoutInput>;
