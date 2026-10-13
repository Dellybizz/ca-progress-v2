"use client";
import {useRouter} from 'next/navigation';
import {AccountCredentials} from './onboarding/accounts';
import {useOnline} from './onboarding/use-online';
export function AccountSetupForm({assignedUsername,next}:{assignedUsername:string;next:string;profileName:string|null}){
 const router=useRouter();return <AccountCredentials online={useOnline()} assignedUsername={assignedUsername} onBack={()=>router.push(next)} onLater={()=>router.push(next)} onProfile={()=>router.push('/settings/profile')} onSave={async(username,password)=>{const response=await fetch('/api/v1/account-setup',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||'Could not finish setup.');router.push(next);router.refresh();}}/>;
}
