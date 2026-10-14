import {readFile,writeFile,mkdir} from 'node:fs/promises';
// Test assets contain the exact production SQL, not a separately maintained copy.
const source=await readFile('apps/mobile/src/onboarding-storage.ts','utf8');
const sql={};
for(const name of ['setupLocalCasSql','setupHandoffSql','setupHandoffDeleteSql']){
 const match=source.match(new RegExp('export const '+name+'=`([^`]+)`;'));
 if(!match)throw new Error(`Cannot extract ${name}`);
 sql[name]=match[1];
}
await mkdir('android/app/src/androidTest/assets',{recursive:true});
await writeFile('android/app/src/androidTest/assets/onboarding-sql.json',JSON.stringify(sql));
console.log('Prepared exact production onboarding SQL for installed Android tests.');
