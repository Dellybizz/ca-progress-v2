import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {OnboardingAssets} from '../../components/auth/onboarding/design-system';
import {BookWelcome,FeatureSignup} from '../../components/auth/onboarding/welcome';
declare const __ONBOARDING_PREVIEW_ASSETS__:OnboardingAssets;
function Preview(){
 const [started,setStarted]=useState(false),[message,setMessage]=useState(''),[online,setOnline]=useState(true);
 return <><div style={{position:'fixed',right:12,top:12,zIndex:10,background:'#fff',padding:8,borderRadius:12,fontFamily:'Arial',fontSize:12}}><label><input type="checkbox" checked={!online} onChange={event=>setOnline(!event.target.checked)}/> Preview offline</label><button type="button" onClick={()=>{setStarted(false);setMessage('');}}>Restart preview</button></div>{started?<FeatureSignup assets={__ONBOARDING_PREVIEW_ASSETS__} online={online} error={message} onBack={()=>{setStarted(false);setMessage('');}} onGoogle={()=>setMessage('Preview only. Google sign-in uses the existing verified route in the app.')} onLinkedIn={()=>setMessage('Preview only. LinkedIn sign-in uses the existing verified route in the app.')} onLogin={()=>setMessage('Preview only. Existing users continue through their current login flow.')}/>:<BookWelcome assets={__ONBOARDING_PREVIEW_ASSETS__} onBegin={()=>setStarted(true)}/>}</>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
