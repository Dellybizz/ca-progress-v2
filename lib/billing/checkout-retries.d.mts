import type {Database,CheckoutInput,Statement} from './checkout-engine.mjs';
export function reserveRetry(db:Database,user:string,input:CheckoutInput):Promise<Record<string,unknown>|null>;
export function retryProjectionStatements(db:Database,id:unknown):Statement[];
export function maintainCheckoutRetries(db:Database,provider:(path:string,init?:RequestInit)=>Promise<Record<string,unknown>>,user?:string):Promise<void>;
