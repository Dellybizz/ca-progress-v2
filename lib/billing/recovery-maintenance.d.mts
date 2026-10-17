import type {Database} from './checkout-engine.mjs';
export function maintainRecovery(db:Database,now?:string):Promise<void>;
