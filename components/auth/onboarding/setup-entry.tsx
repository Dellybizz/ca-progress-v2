"use client";
import {useMemo} from 'react';
import {useRouter} from 'next/navigation';
import {PersistentSetup} from './persistent-setup';
import {indexedSetupStore} from '@/lib/profile/setup-storage';
import {SetupRequestError,type SetupState} from '@/lib/profile/setup-contract';
import {sendSetupRequest} from '@/lib/profile/setup-request';
import type {SetupBootstrap} from '@/lib/profile/setup-bootstrap';
import type {AttemptOption} from '@/lib/profile/validation';
export function SetupEntry({initial,attempts,existingGoal,accountId,next}:{initial:SetupState;attempts:AttemptOption[];existingGoal:number|null;accountId:string;next:string}){
 const router=useRouter(),store=useMemo(()=>indexedSetupStore(),[]),boot=useMemo(()=>({ownerId:accountId,completed:false,state:initial,attempts,existingGoal}),[accountId,initial,attempts,existingGoal]);
 const transport=useMemo(()=>({read:async()=>{const response=await fetch('/api/v1/onboarding',{cache:'no-store',signal:AbortSignal.timeout(20_000)});const result=await response.json();if(!response.ok||result.ok!==true)throw new SetupRequestError(result.error||'Setup could not refresh.',response.status);return result as SetupBootstrap;},write:(draft:SetupState['draft'],revision:number,action:'draft'|'complete')=>sendSetupRequest(accountId,draft,revision,action)}),[accountId]);
 const open=()=>{router.replace(next);router.refresh();};
 return <PersistentSetup scope={`account:${accountId}`} ownerId={accountId} store={store} transport={transport} initial={boot} onExit={()=>router.push('/welcome')} onOpenWorkspace={open} onServerComplete={open}/>;
}
