import {emptySetupDraft,validateSetupDraft} from './setup-contract';
import {newLocalSetup,type LocalSetup,type SetupStore} from './setup-local';
export function decodeLocalSetup(scope:string,input:unknown):LocalSetup|null {
 if(input===null||input===undefined)return null;
 const row=input as LocalSetup,keys=Object.keys(newLocalSetup(scope)),draftKeys=Object.keys(emptySetupDraft());
 const historicalDraft=(value:unknown)=>value===null||Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>draftKeys.includes(k)));
 if(!row||typeof row!=='object'||Object.keys(row).some(k=>!keys.includes(k))||row.version!==1||row.scope!==scope||!Number.isSafeInteger(row.localVersion)||row.localVersion<1||!Array.isArray(row.attempts)||!validateSetupDraft(row.draft,row.attempts).ok||!['draft','complete',null].includes(row.pending)||typeof row.completed!=='boolean'||typeof row.checked!=='boolean'||typeof row.reviewing!=='boolean'||!(row.serverRevision===null||Number.isSafeInteger(row.serverRevision)&&row.serverRevision>=0))throw new Error('Saved setup could not be read safely. It has been retained on this device.');
 if(!historicalDraft(row.baseline)||!historicalDraft(row.retainedDraft)||row.lastSent&&(!historicalDraft(row.lastSent.draft)||!['draft','complete'].includes(row.lastSent.action)||!Number.isSafeInteger(row.lastSent.revision)||row.lastSent.revision<0)||row.conflict&&(row.conflict.ownerId!==scope.slice('account:'.length)||!historicalDraft(row.conflict.state?.draft)))throw new Error('Saved setup could not be read safely. It has been retained on this device.');
 return row;
}
export function indexedSetupStore():SetupStore & {hasPending():Promise<boolean>} {
 async function open(){return new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('ca-progress-onboarding',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'scope'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Local setup storage is unavailable.'));request.onblocked=()=>reject(new Error('Close other setup windows to open local storage.'));});}
 async function transact<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore,set:(value:T)=>void)=>void):Promise<T>{const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode);let value:T;tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=tx.onabort=()=>{db.close();reject(new Error('Your setup could not be saved on this device.'));};try{run(tx.objectStore('drafts'),next=>{value=next;});}catch(e){tx.abort();db.close();reject(e);}});}
 return {
  hasPending:()=>transact('readonly',(store,set)=>{const request=store.getAll();request.onsuccess=()=>set(request.result.some((row:LocalSetup)=>row.scope.startsWith('account:')&&!row.completed&&Boolean(row.pending||row.conflict||row.reviewing)));}),
  read:scope=>transact('readonly',(store,set)=>{const request=store.get(scope);request.onsuccess=()=>{try{set(decodeLocalSetup(scope,request.result));}catch{request.transaction?.abort();}};}),
  cas:(scope,expected,value)=>transact('readwrite',(store,set)=>{const request=store.get(scope);request.onsuccess=()=>{if((request.result?.localVersion||0)!==expected){set(false);return;}store.put(value);set(true);};}),
  remove:scope=>transact('readwrite',(store,set)=>{store.delete(scope);set(undefined);}),
  handoff:(source,expected,value)=>transact('readwrite',(store,set)=>{const a=store.get(source.scope),b=store.get(value.scope);let count=0;const ready=()=>{if(++count!==2)return;if(a.result?.localVersion!==source.localVersion||(b.result?.localVersion||0)!==expected){set(false);return;}store.put(value);store.delete(source.scope);set(true);};a.onsuccess=ready;b.onsuccess=ready;}),
 };
}
