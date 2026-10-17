import {Capacitor} from '@capacitor/core';
import {query,execute,transaction} from '../../../packages/mobile-data/src/database';
import {decodeLocalSetup,indexedSetupStore} from '../../../lib/profile/setup-storage';
import type {LocalSetup,SetupStore} from '../../../lib/profile/setup-local';
const key=(scope:string)=>`ca.onboarding.v1:${scope}`;
export const setupLocalCasSql=`INSERT OR REPLACE INTO local_meta(key,value,updated_at) SELECT ?1,?2,?3 WHERE (?4 IS NULL AND NOT EXISTS(SELECT 1 FROM local_meta WHERE key=?1)) OR EXISTS(SELECT 1 FROM local_meta WHERE key=?1 AND value=?4)`;
export const setupHandoffSql=`INSERT OR REPLACE INTO local_meta(key,value,updated_at) SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM local_meta WHERE key=?5 AND value=?6) AND ((?4 IS NULL AND NOT EXISTS(SELECT 1 FROM local_meta WHERE key=?1)) OR EXISTS(SELECT 1 FROM local_meta WHERE key=?1 AND value=?4))`;
export const setupHandoffDeleteSql=`DELETE FROM local_meta WHERE key=?1 AND value=?2 AND EXISTS(SELECT 1 FROM local_meta WHERE key=?3 AND value=?4)`;
export function nativeSetupStore():SetupStore {
 if(!Capacitor.isNativePlatform())return indexedSetupStore();
 const raw=async(scope:string)=>(await query<{value:string}>('SELECT value FROM local_meta WHERE key=?',[key(scope)]))[0]?.value??null;
 const read=async(scope:string)=>decodeLocalSetup(scope,JSON.parse(await raw(scope)||'null'));
 return {read,cas:async(scope,expected,value)=>{const prior=await raw(scope);if((prior?decodeLocalSetup(scope,JSON.parse(prior))!.localVersion:0)!==expected)return false;await execute(setupLocalCasSql,[key(scope),JSON.stringify(value),new Date().toISOString(),prior]);return (await read(scope))?.writeId===value.writeId;},remove:async scope=>{await execute('DELETE FROM local_meta WHERE key=?',[key(scope)]);},handoff:async(source:LocalSetup,expected,value)=>{const [from,to]=await Promise.all([raw(source.scope),raw(value.scope)]);if(!from||decodeLocalSetup(source.scope,JSON.parse(from))!.localVersion!==source.localVersion||(to?decodeLocalSetup(value.scope,JSON.parse(to))!.localVersion:0)!==expected)return false;const encoded=JSON.stringify(value);await transaction([{sql:setupHandoffSql,args:[key(value.scope),encoded,new Date().toISOString(),to,key(source.scope),from]},{sql:setupHandoffDeleteSql,args:[key(source.scope),from,key(value.scope),encoded]}]);return (await read(value.scope))?.writeId===value.writeId;}};
}
export const removeNativeSetup=(ownerId:string)=>nativeSetupStore().remove(`account:${ownerId}`);
