type Provider=(path:string,init?:RequestInit)=>Promise<Record<string,unknown>>;
type Statement={bind(...values:unknown[]):Statement;first<T=Record<string,unknown>>():Promise<T|null>;all<T=Record<string,unknown>>():Promise<{results?:T[]}>;run():Promise<{meta?:{changes?:number};success?:boolean}>};
type Database={prepare(q:string):Statement;batch(statements:Statement[]):Promise<unknown>};
export function stopProviderRenewal(provider:Provider,local:Record<string,unknown>,atPeriodEnd:boolean):Promise<Record<string,unknown>>;
export function maintainCollectionDeadlines(db:Database,provider:Provider,now?:string,sync?:((subscriptionId:string,userId:string)=>Promise<unknown>)|null):Promise<void>;
export function maintainCommercialChanges(db:Database,provider:Provider,sync:(subscriptionId:string,userId:string)=>Promise<unknown>,now?:string):Promise<void>;

export function maintainRequestedCancellations(db:Database,provider:Provider,now?:string):Promise<void>;
