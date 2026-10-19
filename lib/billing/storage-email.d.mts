import type {StorageDatabase} from './storage-cleanup.mjs';
export type StorageEmailEnv={RESEND_API_KEY?:string;STORAGE_CLEANUP_EMAIL_FROM?:string};
export function storageEmailSender(env:StorageEmailEnv,request?:typeof fetch):(payload:Record<string,unknown>,key:string)=>Promise<string>;
export function maintainStorageEmails(db:StorageDatabase,send:(payload:Record<string,unknown>,key:string)=>Promise<string>,from?:string,time?:string):Promise<void>;
