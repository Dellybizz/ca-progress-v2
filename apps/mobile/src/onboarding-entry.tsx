import {useMemo,useState} from 'react';
import {PersistentSetup} from '../../../components/auth/onboarding/persistent-setup';
import {SetupRequestError,type SetupDraft} from '../../../lib/profile/setup-contract';
import type {SetupBootstrap} from '../../../lib/profile/setup-bootstrap';
import {nativeApiRequest,readOfflineSessionAccountId,NativeRequestError} from './native-auth';
import {nativeSetupStore} from './onboarding-storage';
export const nativeOnboardingAssets={stationery:'assets/onboarding/stationery.svg',book:'assets/onboarding/book.svg'};
export function nativeSetupTransport(ownerId:string){
 async function request(init:RequestInit={}){if(await readOfflineSessionAccountId()!==ownerId)throw new SetupRequestError('Sign in to this account before syncing its setup.',401);try{return await nativeApiRequest('/api/v1/onboarding',init);}catch(e){if(e instanceof NativeRequestError)throw new SetupRequestError(e.message,e.status);throw e;}}
 return {read:async()=>await request() as SetupBootstrap,write:async(draft:SetupDraft,revision:number,action:'draft'|'complete')=>await request({method:'POST',body:JSON.stringify({schemaVersion:2,ownerId,draft,revision,action})}) as {ok:true;revision?:number;completed?:boolean;alreadyCompleted?:boolean}};
}
export function NativeSetupGate({ownerId,onWorkspace}:{ownerId:string;onWorkspace:()=>void}){
 const [hidden,setHidden]=useState(false);const open=()=>{setHidden(true);onWorkspace();};
 const store=useMemo(()=>nativeSetupStore(),[]),transport=useMemo(()=>nativeSetupTransport(ownerId),[ownerId]);
 return <PersistentSetup native scope={`account:${ownerId}`} ownerId={ownerId} store={store} transport={transport} assets={nativeOnboardingAssets} allowHandoff hidden={hidden} onShow={()=>setHidden(false)} onExit={open} onOpenWorkspace={open} onServerComplete={()=>{if(hidden)window.dispatchEvent(new Event('ca-sync'));else open();}}/>;
}
export function NativeDeviceSetup({onBack,onSignIn}:{onBack:()=>void;onSignIn:()=>void}){
 const store=useMemo(()=>nativeSetupStore(),[]);
 return <PersistentSetup scope="installation" ownerId={null} store={store} transport={null} assets={nativeOnboardingAssets} onExit={onBack} onOpenWorkspace={onSignIn} onServerComplete={()=>undefined} pendingActionLabel="Sign in to sync"/>;
}
