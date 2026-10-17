import {useState} from 'react';
import {BookWelcome,FeatureSignup} from '../../../components/auth/onboarding/welcome';
const nativeAssets={stationery:'assets/onboarding/stationery.svg',book:'assets/onboarding/book.svg'};
export function NativeWelcome({online,busy=false,error,onProvider,onLogin,onOfflineSetup}:{online:boolean;busy?:boolean;error?:string;onProvider:(provider:'google'|'linkedin_oidc')=>void;onLogin:()=>void;onOfflineSetup:()=>void}){
 const [started,setStarted]=useState(false);
 return started?<FeatureSignup assets={nativeAssets} online={online} busy={busy} error={error} onBack={()=>setStarted(false)} onGoogle={()=>onProvider('google')} onLinkedIn={()=>onProvider('linkedin_oidc')} onLogin={onLogin} onOfflineSetup={onOfflineSetup}/>:<BookWelcome assets={nativeAssets} onBegin={()=>setStarted(true)}/>;
}
