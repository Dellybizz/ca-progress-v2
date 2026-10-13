"use client";
import {useRouter} from 'next/navigation';
import {getOrCreateGuestIdentity} from '@/lib/auth/guest';
import {AccountLogin} from './onboarding/accounts';
import {useOnline} from './onboarding/use-online';
export function LoginPanel({next,initialError,resetComplete=false}:{next:string;initialError?:string|null;resetComplete?:boolean}){
 const router=useRouter(),online=useOnline();
 return <AccountLogin online={online} error={initialError||''} success={resetComplete?'Password changed. Log in with your new password.':''} onBack={()=>router.push('/welcome')} onSignup={()=>router.push(`/welcome?next=${encodeURIComponent(next)}`)} onRecovery={()=>router.push('/account/recover')} onProvider={(provider,remember)=>window.location.assign(new URL(`/auth/${provider==='google'?'google':'linkedin'}?next=${encodeURIComponent(next)}&remember=${remember}`,window.location.origin).href)} onLogin={async(username,password,remember)=>{
 const response=await fetch('/api/v1/password-auth',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',username,password,remember})});const result=await response.json() as {error?:{message?:string}};if(!response.ok)throw new Error(result.error?.message||'Sign-in failed.');router.push(next);router.refresh();
 }} onGuest={async()=>{let id:string|null=null;if(online){try{const response=await fetch('/api/v1/offline/context',{cache:'no-store',credentials:'same-origin'});if(response.ok)id=(await response.json() as {guestId?:string}).guestId||null;}catch{ /* Local guest access can proceed when the network fails. */ }}getOrCreateGuestIdentity(id);router.push(next);router.refresh();}}/>;
}
