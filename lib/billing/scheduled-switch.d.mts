type Row=Record<string,unknown>;
type Statement={bind(...values:unknown[]):Statement;first<T=Row>():Promise<T|null>;all<T=Row>():Promise<{results?:T[]}>;run():Promise<{meta?:{changes?:number}}>};
type Database={prepare(query:string):Statement;batch(statements:Statement[]):Promise<unknown>};
type Provider=(path:string,init?:RequestInit)=>Promise<Row>;
export function maintainScheduledSwitch(db:Database,provider:Provider,row:Row,token:string,time:string):Promise<void>;
export function reverseScheduledSwitch(db:Database,provider:Provider,user:string,sourceId:string):Promise<boolean>;
export function enforceScheduledSwitchBoundary<T extends object>(db:Database,local:Row,evidence:T):Promise<T>;
