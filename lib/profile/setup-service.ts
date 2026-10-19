import 'server-only';
import {getD1RuntimeDatabase} from '@/lib/data/d1/client';
import {validateAcademicContextSelection} from '@/lib/academic/student-context';
import {validateSetupDraft,type SetupDraft} from './setup-contract';
import type {AttemptOption} from './validation';
import {writeSetupSql,updateSetupSql,completeSetupProfileSql,completeSetupPreparationSql,finishSetupSql} from './setup-sql';
export class SetupError extends Error{constructor(message:string,readonly status:number){super(message);}}
export async function persistSetup(userId:string,input:unknown,expectedRevision:unknown,complete:boolean,attempts:AttemptOption[]){
 if(typeof expectedRevision!=='number'||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new SetupError('Reload this setup before saving.',400);
 const checked=validateSetupDraft(input,attempts,complete);if(!checked.ok)throw new SetupError(checked.error,400);const d=checked.value;
 if(complete&&d.attemptDecision==='decided'){const canonical=await validateAcademicContextSelection({level:d.level,group:d.group,attemptKey:d.attemptKey});if(!canonical.ok)throw new SetupError(canonical.error,400);if(d.group==='both'&&canonical.scope.groupIds.length<2)throw new SetupError('Both groups are not available for this attempt.',400);}
 const database=getD1RuntimeDatabase(),writeId=crypto.randomUUID(),statements=[database.prepare(expectedRevision===0?writeSetupSql:updateSetupSql).bind(userId,JSON.stringify(d),writeId,expectedRevision)];
 if(complete){statements.push(database.prepare(completeSetupProfileSql).bind(d.level,d.group,d.attemptKey,d.goalMode,d.dailyTargetMinutes,userId,writeId),database.prepare(completeSetupPreparationSql).bind(userId,d.preparationState,writeId),database.prepare(finishSetupSql).bind(userId,writeId));}
 const result=await database.batch<{revision:number}>(statements),revision=result[0]?.results?.[0]?.revision;
 if(!revision){const row=await database.prepare('SELECT onboarding_completed_at FROM profiles WHERE user_id=?1').bind(userId).first<{onboarding_completed_at:string|null}>();if(row?.onboarding_completed_at)return {ok:true,alreadyCompleted:true};throw new SetupError('Setup changed on another tab or device. Reload to continue with the latest choices.',409);}
 return {ok:true,revision,draft:d as SetupDraft,completed:complete,tentative:d.attemptDecision==='undecided'};
}
