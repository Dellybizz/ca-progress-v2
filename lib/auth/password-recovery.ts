import 'server-only';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {cookies,headers} from 'next/headers';
import {createPasswordHash} from './password';
import {claimRecoverySql,updateRecoveryPasswordSql,revokeRecoverySessionsSql,invalidateRecoveryNativeSql,invalidateRecoveryProofsSql} from './recovery-sql';
const COOKIE='ca_password_recovery';
const options={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/',maxAge:600};
type Statement={bind(...values:unknown[]):Statement;first<T>():Promise<T|null>};
type Database={prepare(sql:string):Statement;batch(statements:Statement[]):Promise<{results?:{user_id?:string}[]}[]>};
const db=()=>{const database=(getCloudflareContext().env as unknown as {DB?:Database}).DB;if(!database)throw new Error('Recovery database unavailable.');return database;};
export class PasswordRecoveryError extends Error{constructor(readonly status=403){super('We could not verify this reset. Use your linked account to start again.');}}
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function recoveryLimit(scope:string,maximum=8){const row=await db().prepare(`INSERT INTO password_auth_limits(scope,attempts,expires_at) VALUES(?1,1,?2)
 ON CONFLICT(scope) DO UPDATE SET attempts=CASE WHEN julianday(expires_at)<=julianday('now') THEN 1 ELSE attempts+1 END,
 expires_at=CASE WHEN julianday(expires_at)<=julianday('now') THEN excluded.expires_at ELSE expires_at END RETURNING attempts`).bind('recovery:'+scope,new Date(Date.now()+15*60000).toISOString()).first<{attempts:number}>();if(!row||row.attempts>maximum)throw new PasswordRecoveryError(429);}
export async function limitRecoveryStart(){const requestHeaders=await headers();await recoveryLimit('ip:'+await hash(requestHeaders.get('cf-connecting-ip')||'unknown'),20);}
export async function issuePasswordRecovery(provider:string,subject:string){
 // Only exact existing linked identities may recover. No email matching, provisioning,
 // bootstrap, normal sign-in session or account ID from the client is accepted.
 const row=await db().prepare(`SELECT i.identity_id,i.application_user_id,pc.password_hash FROM auth_identities i
 JOIN app_users u ON u.user_id=i.application_user_id JOIN password_credentials pc ON pc.user_id=u.user_id
 WHERE i.provider=?1 AND i.provider_user_id=?2 AND u.account_state='active' AND u.auth_provider<>'guest-test'
 AND i.provider IN ('google','linkedin_oidc')`).bind(provider,subject).first<{identity_id:string;application_user_id:string;password_hash:string}>();
 if(!row)throw new PasswordRecoveryError();await recoveryLimit('user:'+row.application_user_id);
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 await db().batch([db().prepare(`DELETE FROM password_recovery_proofs WHERE julianday(expires_at)<julianday('now','-1 day')`),db().prepare(`INSERT INTO password_recovery_proofs(token_hash,user_id,identity_id,credential_hash,expires_at) VALUES(?1,?2,?3,?4,?5)`).bind(await hash(token),row.application_user_id,row.identity_id,row.password_hash,new Date(Date.now()+600000).toISOString())]);
 (await cookies()).set(COOKIE,token,options);return row.application_user_id;
}
async function proof(){const raw=(await cookies()).get(COOKIE)?.value;if(!raw||!/^[a-f0-9]{64}$/.test(raw))return null;const tokenHash=await hash(raw);const row=await db().prepare(`SELECT p.user_id,pc.username FROM password_recovery_proofs p
 JOIN password_credentials pc ON pc.user_id=p.user_id JOIN app_users u ON u.user_id=p.user_id
 JOIN auth_identities i ON i.identity_id=p.identity_id AND i.application_user_id=p.user_id
 WHERE p.token_hash=?1 AND p.consumed_by IS NULL AND julianday(p.expires_at)>julianday('now')
 AND pc.password_hash=p.credential_hash AND u.account_state='active' AND i.provider IN ('google','linkedin_oidc')`).bind(tokenHash).first<{user_id:string;username:string}>();return row?{...row,tokenHash}:null;}
export async function passwordRecoveryState(){const row=await proof();return row?{username:row.username}:null;}
export async function completePasswordRecovery(password:string){
 const row=await proof();if(!row)throw new PasswordRecoveryError();await recoveryLimit('reset:'+row.user_id);
 const credential=await createPasswordHash(password),claim=crypto.randomUUID(),database=db();
 const result=await database.batch([
 database.prepare(claimRecoverySql).bind(claim,row.tokenHash,row.user_id),
 database.prepare(updateRecoveryPasswordSql).bind(credential.salt,credential.hash,credential.iterations,row.user_id,row.tokenHash,claim),
 database.prepare(revokeRecoverySessionsSql).bind(row.user_id,row.tokenHash,claim),
 database.prepare(invalidateRecoveryNativeSql).bind(row.user_id,row.tokenHash,claim),
 database.prepare(invalidateRecoveryProofsSql).bind(claim,row.user_id,row.tokenHash)
 ]);
 if(result[1]?.results?.[0]?.user_id!==row.user_id)throw new PasswordRecoveryError();
 const store=await cookies();store.set(COOKIE,'',{...options,maxAge:0});store.set('ca_session','',{...options,maxAge:0});return {passwordChanged:true};
}
