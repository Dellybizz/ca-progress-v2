"use client";
import {useState} from 'react';
import {SetupScreens} from './setup';
import {emptySetupDraft} from '@/lib/profile/setup-contract';
import type {AttemptOption} from '@/lib/profile/validation';
export function SetupPreview({attempts}:{attempts:AttemptOption[]}){const [session,setSession]=useState(0),[done,setDone]=useState(false);return done?<main className="ca-setup-preview-finish"><h1>Preview complete</h1><p>No account data has been saved.</p><button onClick={()=>{setSession(s=>s+1);setDone(false);}}>Restart preview</button><a href="/welcome">Open CA Progress</a></main>:<SetupScreens key={session} preview initial={{draft:emptySetupDraft(),revision:0}} attempts={attempts} existingGoal={null} onExit={()=>{setSession(s=>s+1);}} onSave={async(_draft,revision)=>({revision})} onComplete={async()=>setDone(true)}/>;}
