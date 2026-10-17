import type {StorageDatabase} from './storage-cleanup.mjs';
export function storageAllowance<T extends {planId:string;allowed:boolean;storageLimitBytes?:number|null;limitValue?:number|null;limitUnit?:string;tier?:string}>(db:StorageDatabase,user:string,entitlement:T,time?:string):Promise<T & {limitBytes:number}>;
