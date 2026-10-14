import {useState} from 'react';
import {BookWelcome,FeatureSignup} from '../../../components/auth/onboarding/welcome';
const nativeAssets={stationery:'assets/onboarding/stationery.svg',book:'assets/onboarding/book.svg'};
export function NativeWelcome({online,busy=false,error,onProvider,onLogin,onOfflineSetup,onGuest}:{online:boolean;busy?:boolean;error?:string;onProvider:(provider:'google'|'linkedin_oidc')=>void;onLogin:()=>void;onOfflineSetup:()=>void;onGuest:()=>void}){
 const [started,setStarted]=useState(false);
 return started?<FeatureSignup assets={nativeAssets} online={online} busy={busy} error={error} onBack={()=>setStarted(false)} onGoogle={()=>onProvider('google')} onLinkedIn={()=>onProvider('linkedin_oidc')} onLogin={onLogin} onOfflineSetup={onOfflineSetup} onGuest={onGuest}/>:<BookWelcome assets={nativeAssets} onBegin={()=>setStarted(true)}/>;
}
