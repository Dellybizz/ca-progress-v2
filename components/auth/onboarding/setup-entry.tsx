"use client";
import {useRouter} from 'next/navigation';
import {SetupScreens} from './setup';
import {useOnline} from './use-online';
import {SetupRequestError,type SetupDraft,type SetupState} from '@/lib/profile/setup-contract';
import type {AttemptOption} from '@/lib/profile/validation';
export function SetupEntry({initial,attempts,existingGoal,accountId,next}:{initial:SetupState;attempts:AttemptOption[];existingGoal:number|null;accountId:string;next:string}){
 const router=useRouter();async function request(draft:SetupDraft,revision:number,action:'draft'|'complete'){const response=await fetch('/api/v1/onboarding',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({schemaVersion:2,ownerId:accountId,action,draft,revision})});const result=await response.json() as {ok?:boolean;revision?:number;alreadyCompleted?:boolean;error?:string};if(!response.ok||!result.ok)throw new SetupRequestError(result.error||'Could not save setup.',response.status);return result;}
 return <SetupScreens initial={initial} attempts={attempts} existingGoal={existingGoal} online={useOnline()} onExit={()=>router.push('/welcome')} onReload={()=>window.location.reload()} onSave={async(d,r)=>{const result=await request(d,r,'draft');if(result.alreadyCompleted){router.replace(next);router.refresh();}return {revision:result.revision||r};}} onComplete={async(d,r)=>{await request(d,r,'complete');router.push(next);router.refresh();}}/>;
}
