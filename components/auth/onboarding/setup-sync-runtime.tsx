"use client";
import {useEffect,useState} from 'react';
import {useRouter,usePathname} from 'next/navigation';
import {SetupCoordinator} from '@/lib/profile/setup-local';
import {indexedSetupStore} from '@/lib/profile/setup-storage';
import {SetupRequestError} from '@/lib/profile/setup-contract';
import type {SetupBootstrap} from '@/lib/profile/setup-bootstrap';
import {sendSetupRequest} from '@/lib/profile/setup-request';
import './setup.css';
export function SetupSyncRuntime({ownerId}:{ownerId:string|null}){
 const router=useRouter(),pathname=usePathname(),[paused,setPaused]=useState(false);
 useEffect(()=>{let active=true,busy=false,current:SetupCoordinator|null=null;
  const sync=async()=>{if(!active||busy||!navigator.onLine)return;busy=true;try{const store=indexedSetupStore();if(pathname.startsWith('/onboarding')&&!document.querySelector('.offline-workspace'))return;if(!ownerId&&!await store.hasPending())return;
 const read=async()=>{const response=await fetch('/api/v1/onboarding',{cache:'no-store',signal:AbortSignal.timeout(20_000)});const result=await response.json();if(!response.ok||!result.ok)throw new SetupRequestError(result.error||'Setup refresh paused.',response.status);return result as SetupBootstrap;};
 const fresh=ownerId?null:await read(),verifiedOwner=ownerId||fresh?.ownerId;if(!verifiedOwner)return;const row=await store.read(`account:${verifiedOwner}`);if(!row||row.completed||!row.pending&&!row.conflict&&!row.reviewing){if(active)setPaused(false);return;}current=new SetupCoordinator(row.scope,verifiedOwner,store,{read,write:(draft,revision,action)=>sendSetupRequest(verifiedOwner,draft,revision,action)},(_replace,finished)=>{if(active&&finished)router.refresh();});await current.initialize(fresh||undefined);await current.refresh();if(active)setPaused(Boolean(current.record.pending||current.record.conflict||current.record.reviewing));}catch{if(active&&current)setPaused(true);}finally{current?.stop();current=null;busy=false;}};
  const resume=()=>void sync();const visible=()=>{if(document.visibilityState==='visible')resume();};window.addEventListener('online',resume);document.addEventListener('visibilitychange',visible);resume();return()=>{active=false;current?.stop();window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',visible);};
 },[ownerId,router,pathname]);
 return paused?<p className="ca-setup-verification" role="status">Device setup is waiting to sync or needs review. <a href="/onboarding">Review saved setup</a></p>:null;
}
