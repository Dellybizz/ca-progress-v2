"use client";
import {useRouter} from 'next/navigation';
import {SetupScreens} from './setup';
import {useOnline} from './use-online';
import {type SetupState} from '@/lib/profile/setup-contract';
import {sendSetupRequest} from '@/lib/profile/setup-request';
import type {AttemptOption} from '@/lib/profile/validation';
export function SetupEntry({initial,attempts,existingGoal,accountId,next}:{initial:SetupState;attempts:AttemptOption[];existingGoal:number|null;accountId:string;next:string}){
 const router=useRouter();const openWorkspace=()=>{router.replace(next);router.refresh();};
 return <SetupScreens initial={initial} attempts={attempts} existingGoal={existingGoal} online={useOnline()} onOpenWorkspace={openWorkspace} onExit={()=>router.push('/welcome')} onReload={()=>window.location.reload()} onSave={async(d,r)=>{const result=await sendSetupRequest(accountId,d,r,'draft');if(result.alreadyCompleted)openWorkspace();return {revision:result.revision||r,alreadyCompleted:result.alreadyCompleted};}} onComplete={async(d,r)=>{await sendSetupRequest(accountId,d,r,'complete');openWorkspace();}}/>;
}
