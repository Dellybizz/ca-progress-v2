import {useState} from 'react';
import {BookWelcome,FeatureSignup} from '../../../components/auth/onboarding/welcome';
const nativeAssets={stationery:'assets/onboarding/stationery.svg',book:'assets/onboarding/book.svg'};
// The native entry point wires this in Phase 6, after account/draft handoff gates.
export function NativeWelcome({online,busy=false,error,onProvider,onLogin}:{online:boolean;busy?:boolean;error?:string;onProvider:(provider:'google'|'linkedin_oidc')=>void;onLogin:()=>void}){
 const [started,setStarted]=useState(false);
 return started?<FeatureSignup assets={nativeAssets} online={online} busy={busy} error={error} onBack={()=>setStarted(false)} onGoogle={()=>onProvider('google')} onLinkedIn={()=>onProvider('linkedin_oidc')} onLogin={onLogin}/>:<BookWelcome assets={nativeAssets} onBegin={()=>setStarted(true)}/>;
}
