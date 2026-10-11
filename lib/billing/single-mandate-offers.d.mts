import type {Database} from './upgrade-engine.mjs';
type Terms={durationValue?:number;trialDays?:number;planId:string;policyVersionId:string;recurringPrice:number;currency:string;tierKey:string;billingCycle:string;introPrice:number|null;introCycles:number;introProviderOfferId:string|null;introOfferVerified:boolean};
export function mandateOfferMatches(binding:Record<string,unknown>|null,terms:Terms,intro:unknown,method:string):boolean;
export function singleMandateTerms<T extends Terms>(db:Database,user:string,terms:T,method:string):Promise<(T & {allowRegularPriceFallback:boolean})|null>;
