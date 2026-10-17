import type {GiftDatabase,GiftProvider} from './gifts.mjs';
export function maintainGiftSources(db:GiftDatabase,provider:GiftProvider):Promise<void>;
export function enforceGiftSourceBoundary<T extends object>(db:GiftDatabase,local:Record<string,unknown>,evidence:T):Promise<T>;
