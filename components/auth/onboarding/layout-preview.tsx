"use client";
import {useState} from 'react';
import {BookWelcome,FeatureSignup} from './welcome';
import {AccountLogin,AccountCredentials,AccountRecovery} from './accounts';
import {SetupScreens} from './setup';
import {emptySetupDraft,SETUP_STEPS,type SetupDraft,type SetupStep} from '@/lib/profile/setup-contract';
import './layout-preview.css';
const screens=['welcome','features','login','credentials','recovery','reset',...SETUP_STEPS,'pending'] as const;
const sizes=[{name:'Small phone',width:320,height:640},{name:'Phone',width:390,height:844},{name:'Phone landscape',width:844,height:390},{name:'Tablet',width:768,height:1024},{name:'Desktop',width:1280,height:800}] as const;
const noAction=()=>undefined;
const rejectAction=async()=>{throw new Error('Preview only. This form does not contact an account service.');};
function PreviewScreen({screen}:{screen:string}){
 const [notice,setNotice]=useState('');
 const announce=()=>setNotice('Preview only. No account action was performed.');
 const common={onBack:announce,error:notice};
 if(screen==='welcome')return <BookWelcome onBegin={announce}/>;
 if(screen==='features')return <FeatureSignup {...common} onGoogle={announce} onLinkedIn={announce} onLogin={announce} onOfflineSetup={announce}/>;
 if(screen==='login')return <AccountLogin {...common} onLogin={rejectAction} onProvider={announce} onRecovery={announce} onSignup={announce}/>;
 if(screen==='credentials'||screen==='reset')return <AccountCredentials {...common} assignedUsername="aisha.khan" reset={screen==='reset'} onSave={rejectAction} onProfile={screen==='credentials'?announce:undefined} onLater={screen==='credentials'?announce:undefined}/>;
 if(screen==='recovery')return <AccountRecovery {...common} onProvider={announce}/>;
 const step=SETUP_STEPS.includes(screen as SetupStep)?screen as SetupStep:'review';
 const draft:SetupDraft={...emptySetupDraft(),step,level:step==='intro'||step==='level'?null:'intermediate',group:step==='intro'||step==='level'?null:'both',attemptDecision:step==='intro'||step==='level'?null:'undecided',preparationState:'studying',support:['progress','planner','notes','consistency'],goalMode:'set',dailyTargetMinutes:147};
 return <SetupScreens initial={{draft,revision:0}} attempts={[]} existingGoal={90} preview syncNote="Illustrative pending-sync screen. This layout preview does not save choices." initialPending={screen==='pending'} onExit={noAction} onSave={async()=>({revision:0})} onComplete={async()=>({pending:true})}/>;
}
export function OnboardingLayoutPreview({embedded,screen:initialScreen}:{embedded:boolean;screen?:string}){
 const [screen,setScreen]=useState(screens.includes(initialScreen as typeof screens[number])?initialScreen!:'review'),[size,setSize]=useState(1);
 if(embedded)return <PreviewScreen key={screen} screen={screen}/>;
 const viewport=sizes[size];
 return <main className="ca-layout-preview"><h1>Onboarding responsive preview</h1><p>Isolated sample screens. Forms do not sign in, reset passwords or save account data.</p><div className="ca-layout-controls"><label>Screen<select value={screen} onChange={e=>setScreen(e.target.value)}>{screens.map(value=><option key={value} value={value}>{value}</option>)}</select></label><label>Viewport<select value={size} onChange={e=>setSize(Number(e.target.value))}>{sizes.map((value,index)=><option key={value.name} value={index}>{value.name} · {value.width} × {value.height}</option>)}</select></label></div><div className="ca-layout-scroll"><iframe key={`${screen}:${size}`} title="Onboarding viewport" src={`/onboarding-layout-preview?frame=1&screen=${screen}`} width={viewport.width} height={viewport.height}/></div></main>;
}
