import type {FullBackupDatabase} from './backup-data.mjs';
export function ownedAccountDataChunks(db:FullBackupDatabase,userId:string):AsyncGenerator<Uint8Array,void,unknown>;
export function ownedAccountDataStream(db:FullBackupDatabase,userId:string):ReadableStream<Uint8Array>;
