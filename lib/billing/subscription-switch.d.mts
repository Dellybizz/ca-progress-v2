import type {CheckoutInput} from './checkout-engine.mjs';
type Row=Record<string,unknown>;
type Statement={bind(...values:unknown[]):Statement;first<T=Row>():Promise<T|null>;all<T=Row>():Promise<{results?:T[]}>;run():Promise<{meta?:{changes?:number}}>};
type Database={prepare(query:string):Statement;batch(statements:Statement[]):Promise<unknown>};
type Provider=(path:string,init?:RequestInit)=>Promise<Row>;
export function reserveSubscriptionSwitch(db:Database,user:string,input:CheckoutInput,provider:Provider):Promise<void>;
export function maintainSubscriptionSwitches(db:Database,provider:Provider,user?:string):Promise<void>;

export function maintainSwitchChargeRefunds(db:Database,provider:Provider,user?:string):Promise<void>;
