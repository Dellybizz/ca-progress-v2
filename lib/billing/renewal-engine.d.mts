import type {Database} from './checkout-engine.mjs';
export class RenewalError extends Error{code:string;constructor(message:string,code?:string);}
export function expectedCycleAmount(contract:Record<string,unknown>,number:number):number;
export function invoiceCycles(invoices:Record<string,unknown>[],subscriptionId:string):Record<string,unknown>[];
export function verifyCycle(contract:Record<string,unknown>,invoice:Record<string,unknown>,payment:Record<string,unknown>):{expected:number;status:string};
export function collectRenewalEvidence(db:Database,contract:Record<string,unknown>,subscription:Record<string,unknown>,provider:(path:string)=>Promise<Record<string,unknown>>,options?:{keyId?:string;callbackPayment?:Record<string,unknown>|null}):Promise<{paidCount:number;paidThrough:string|null;latestPaidStart:string|null;authorizationOnly:boolean;firstCycleVerified:boolean;fullCycleVerified:boolean}>;
