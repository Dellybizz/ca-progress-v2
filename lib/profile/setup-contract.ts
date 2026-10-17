import {attemptAppliesToLevel,attemptAppliesToSelection,isCALevel,isGroupChoice,isPreparationState,normalizeDailyTarget,type AttemptOption,type CALevel,type GroupChoice,type PreparationState} from './validation';
export const SETUP_VERSION=2 as const;
export const SETUP_STEPS=['intro','level','attempt','group','stage','progress','support','goal','review'] as const;
export type SetupStep=typeof SETUP_STEPS[number];
export const SUPPORT_KEYS=['progress','planner','notes','consistency'] as const;
export type SupportKey=typeof SUPPORT_KEYS[number];
export type SetupDraft={schemaVersion:2;step:SetupStep;level:CALevel|null;group:GroupChoice|null;attemptDecision:'decided'|'undecided'|null;attemptKey:string|null;preparationState:PreparationState|null;support:SupportKey[];goalMode:'keep'|'set'|null;dailyTargetMinutes:number|null};
export type SetupState={draft:SetupDraft;revision:number};
export function setupSteps(level:CALevel|null):SetupStep[]{return SETUP_STEPS.filter(step=>step!=='group'||level!=='foundation');}
export function emptySetupDraft():SetupDraft{return {schemaVersion:2,step:'intro',level:null,group:null,attemptDecision:null,attemptKey:null,preparationState:null,support:[],goalMode:null,dailyTargetMinutes:null};}
export function setupReadiness(draft:SetupDraft,attempts:AttemptOption[]):SetupStep|null{
 if(!draft.level)return 'level';
 if(!draft.attemptDecision)return 'attempt';
 if(draft.attemptDecision==='decided'&&!attempts.some(a=>a.key===draft.attemptKey&&attemptAppliesToLevel(a,draft.level!)))return 'attempt';
 if(!draft.group||(draft.level!=='foundation'&&draft.group==='not_applicable'))return 'group';
 if(draft.attemptDecision==='decided'&&!attempts.some(a=>a.key===draft.attemptKey&&attemptAppliesToSelection(a,draft.level!,draft.group!)))return 'group';
 if(!draft.preparationState)return 'stage';
 if(!draft.goalMode)return 'goal';
 return null;
}
export function validateSetupDraft(input:unknown,attempts:AttemptOption[],complete=false):{ok:true;value:SetupDraft}|{ok:false;error:string}{
 if(!input||typeof input!=='object'||Array.isArray(input))return {ok:false,error:'Invalid setup draft.'};
 const d=input as Record<string,unknown>,keys=Object.keys(emptySetupDraft());
 if(Object.keys(d).some(k=>!keys.includes(k))||d.schemaVersion!==2||!SETUP_STEPS.includes(d.step as SetupStep))return {ok:false,error:'Unsupported setup version or fields.'};
 if(d.level!==null&&!isCALevel(d.level))return {ok:false,error:'Choose a valid CA level.'};
 if(d.group!==null&&!isGroupChoice(d.group))return {ok:false,error:'Choose a valid group.'};
 if(d.attemptDecision!==null&&d.attemptDecision!=='decided'&&d.attemptDecision!=='undecided')return {ok:false,error:'Choose an attempt or Not decided yet.'};
 if(d.attemptKey!==null&&(typeof d.attemptKey!=='string'||d.attemptKey.length>30))return {ok:false,error:'Choose a valid attempt.'};
 if(d.attemptDecision==='decided'&&(!isCALevel(d.level)||!attempts.some(a=>a.key===d.attemptKey&&attemptAppliesToLevel(a,d.level as CALevel))))return {ok:false,error:'This attempt is unavailable for your level. Choose again.'};
 if(d.attemptDecision!=='decided'&&d.attemptKey!==null)return {ok:false,error:'An undecided attempt cannot have a catalog key.'};
 if(d.level==='foundation'&&d.group!=='not_applicable')return {ok:false,error:'Foundation does not use groups.'};
 if(d.level!=='foundation'&&d.group==='not_applicable')return {ok:false,error:'Choose Group 1, Group 2 or Both.'};
 if(d.group&&d.attemptDecision==='decided'&&!attempts.some(a=>a.key===d.attemptKey&&attemptAppliesToSelection(a,d.level as CALevel,d.group as GroupChoice)))return {ok:false,error:'This group is unavailable for your selected attempt.'};
 if(d.preparationState!==null&&!isPreparationState(d.preparationState))return {ok:false,error:'Choose a preparation stage.'};
 if(!Array.isArray(d.support)||d.support.length>4||d.support.some(k=>!SUPPORT_KEYS.includes(k as SupportKey)))return {ok:false,error:'Choose valid support preferences.'};
 if(d.goalMode!==null&&d.goalMode!=='keep'&&d.goalMode!=='set')return {ok:false,error:'Choose a daily goal or Set later.'};
 if(d.goalMode==='set'&&(typeof d.dailyTargetMinutes!=='number'||normalizeDailyTarget(d.dailyTargetMinutes)===null))return {ok:false,error:'Use a whole-minute study goal between 15 and 720 minutes.'};
 if(d.goalMode!=='set'&&d.dailyTargetMinutes!==null)return {ok:false,error:'Set later must preserve your current goal.'};
 const value={...d,support:[...new Set(d.support)]} as SetupDraft;
 const missing=setupReadiness(value,attempts),steps=setupSteps(value.level);
 if(value.step==='group'&&value.level==='foundation')return {ok:false,error:'Foundation skips the group screen.'};
 if(missing&&(complete||steps.indexOf(missing)<steps.indexOf(value.step)))return {ok:false,error:`Finish the ${missing} choice before continuing.`};
 if(complete&&value.step!=='review')return {ok:false,error:'Review your setup before finishing.'};
 return {ok:true,value};
}
export function resumeLegacySetup(profile:{ca_level:string|null;group_choice:string|null;attempt_key:string|null;onboarding_step:number;daily_target_minutes?:number|null;preparation_state:PreparationState|null},attempts:AttemptOption[]):SetupDraft{
 const d=emptySetupDraft();d.level=isCALevel(profile.ca_level)?profile.ca_level:null;d.group=d.level==='foundation'?'not_applicable':isGroupChoice(profile.group_choice)&&profile.group_choice!=='not_applicable'?profile.group_choice:null;
 if(d.level&&attempts.some(a=>a.key===profile.attempt_key&&attemptAppliesToSelection(a,d.level!,d.group||''))){d.attemptKey=profile.attempt_key;d.attemptDecision='decided';}
 d.preparationState=isPreparationState(profile.preparation_state)?profile.preparation_state:null;
 if(profile.daily_target_minutes)d.goalMode='keep';
 if(!profile.onboarding_step&&!d.level)return d;
 const legacyStep=({1:'level',2:'group',3:'attempt',4:'stage'} as Record<number,SetupStep>)[profile.onboarding_step]||'level';
 const missing=setupReadiness(d,attempts),steps=setupSteps(d.level);d.step=legacyStep==='group'&&d.level==='foundation'?'attempt':legacyStep;
 if(missing&&steps.indexOf(missing)<steps.indexOf(d.step))d.step=missing;
 return d;
}
export function chooseSetupLevel(d:SetupDraft,level:CALevel):SetupDraft{if(d.level===level)return d;return {...d,level,group:level==='foundation'?'not_applicable':null,attemptKey:null,attemptDecision:null};}
export function chooseSetupAttempt(d:SetupDraft,key:string|null,attempts:AttemptOption[]):SetupDraft{return {...d,attemptDecision:key?'decided':'undecided',attemptKey:key,group:d.level==='foundation'?'not_applicable':d.group&&attempts.some(a=>a.key===key&&attemptAppliesToSelection(a,d.level!,d.group!))?d.group:null};}

export function reconcileSavedSetup(draft:SetupDraft,attempts:AttemptOption[]):SetupDraft{
 const d={...draft,support:[...draft.support]};
 if(d.level==='foundation')d.group='not_applicable';
 if(d.attemptDecision==='decided'&&!attempts.some(a=>a.key===d.attemptKey&&d.level&&attemptAppliesToLevel(a,d.level))){d.attemptKey=null;d.attemptDecision=null;}
 if(d.level!=='foundation'&&(d.group==='not_applicable'||(d.group&&d.attemptDecision==='decided'&&!attempts.some(a=>a.key===d.attemptKey&&attemptAppliesToSelection(a,d.level!,d.group!)))))d.group=null;
 if(d.step==='group'&&d.level==='foundation')d.step='stage';
 const missing=setupReadiness(d,attempts),steps=setupSteps(d.level);if(missing&&steps.indexOf(missing)<steps.indexOf(d.step))d.step=missing;
 return d;
}

export class SetupRequestError extends Error{constructor(message:string,readonly status:number){super(message);}}
