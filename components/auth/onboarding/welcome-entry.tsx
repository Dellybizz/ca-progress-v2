'use client';
import {useState,useSyncExternalStore} from 'react';
import {useRouter} from 'next/navigation';
import {BookWelcome,FeatureSignup} from './welcome';
function subscribeOnline(update:()=>void){window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};}
export function WelcomeEntry({next}:{next:string}){
 const router=useRouter(),[started,setStarted]=useState(false),online=useSyncExternalStore(subscribeOnline,()=>navigator.onLine,()=>true);
 if(!started)return <BookWelcome onBegin={()=>setStarted(true)}/>;
 const encoded=encodeURIComponent(next);
 return <FeatureSignup online={online} onBack={()=>setStarted(false)} onGoogle={()=>window.location.assign(new URL(`/auth/google?next=${encoded}&remember=true`,window.location.origin).href)} onLinkedIn={()=>window.location.assign(new URL(`/auth/linkedin?next=${encoded}&remember=true`,window.location.origin).href)} onLogin={()=>router.push(`/login?next=${encoded}`)}/>;
}
