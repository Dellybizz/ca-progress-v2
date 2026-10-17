import type {Database} from './checkout-engine.mjs';
export const PREPAID_ACCESS_SQL:string;
export function prepaidAccess(db:Database,userId:string,now?:string):Promise<{ends_at:string|null}|null>;
