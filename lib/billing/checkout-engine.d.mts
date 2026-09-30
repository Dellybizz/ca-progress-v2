export type Database = {prepare(query:string):Statement;batch(statements:Statement[]):Promise<{success?:boolean}[]>};
export type Statement = {bind(...values:unknown[]):Statement;first<T=Record<string,unknown>>():Promise<T|null>;run():Promise<{meta?:{changes?:number}}>};
export type CheckoutInput={requestId:string;planId:string;paymentMethod:"upi"|"card"|"emandate";policyVersionId:string;promoCode:string};
export type CheckoutView={attemptId:string;requestId:string;state:string;subscriptionId:string|null;keyId:string|null;planId:string;policyVersionId:string;paymentMethod:CheckoutInput['paymentMethod'];initialAmount:number|null;recurringAmount:number|null;billingCycle:string|null;trialDays:number;campaignApplied:boolean;promoCode:string|null;expectedCampaignPrice:number|null;totalCount:number;mandateScheduleVersion:string|null;providerEndAt:string|null;providerStatus:string|null;accessGranted:boolean;resumable:boolean;errorCode:string|null;authorizationUrl?:string|null};
export type Dependencies={keyId?:string;preflight?(input:CheckoutInput):Promise<Response|null>;prepare(input:CheckoutInput,userId:string):Promise<{contract:Record<string,unknown>;payload:Record<string,unknown>}>;provider(path:string,init?:RequestInit):Promise<Record<string,unknown>>;releaseCampaign?(userId:string,key:string):Promise<void>;reconcile?(subscriptionId:string,userId:string):Promise<void>;authorizationUrl?(value:unknown):string|null};
export class CheckoutError extends Error {code:string;status:number;constructor(message:string,code:string,status?:number);}
export const ACTIVE_STATES:readonly string[];
export function checkoutInput(value:unknown):CheckoutInput;
export function reserveCheckout(db:Database,userId:string,input:CheckoutInput):Promise<Record<string,unknown>>;
export function latestCheckout(db:Database,userId:string,id?:string):Promise<Record<string,unknown>|null>;
export function publicCheckout(db:Database,row:Record<string,unknown>|null,keyId?:string):Promise<CheckoutView|null>;
export function providerMatches(row:Record<string,unknown>,sub:Record<string,unknown>):boolean;
export function createCheckout(db:Database,userId:string,raw:unknown,deps:Dependencies):Promise<CheckoutView>;
export function recoverCheckout(db:Database,userId:string,id:string|undefined,deps:Dependencies,candidateId?:string):Promise<CheckoutView>;
