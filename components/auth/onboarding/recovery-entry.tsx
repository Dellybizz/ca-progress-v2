"use client";
import {useRouter} from 'next/navigation';
import {AccountRecovery,AccountCredentials} from './accounts';
import {useOnline} from './use-online';
export function RecoveryEntry({error=''}:{error?:string}){const router=useRouter();return <AccountRecovery online={useOnline()} error={error} onBack={()=>router.push('/login')} onProvider={provider=>window.location.assign(new URL(`/auth/${provider==='google'?'google':'linkedin'}?purpose=recovery`,window.location.origin).href)}/>;}
export function ResetEntry({username}:{username:string}){const router=useRouter();return <AccountCredentials online={useOnline()} reset assignedUsername={username} onBack={()=>router.push('/account/recover')} onSave={async(_username,password)=>{const response=await fetch('/api/v1/password-recovery',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||'Could not reset your password.');router.replace('/login?reset=complete');router.refresh();}}/>;}
