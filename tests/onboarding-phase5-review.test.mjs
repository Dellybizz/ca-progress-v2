import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
async function moduleAt(entry){const dir=await mkdtemp(path.join(process.cwd(),'.phase5-test-'));const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom'],loader:{'.css':'empty'}});const file=path.join(dir,'module.mjs');await writeFile(file,result.outputFiles[0].text);return {module:await import('file://'+file),cleanup:()=>rm(dir,{recursive:true,force:true})};}
const attempts=[{key:'2040-01',label:'January 2040',levels:['foundation','intermediate'],groupsByLevel:{intermediate:['group_1']}},{key:'2040-05',label:'May 2040',levels:['intermediate','final'],groupsByLevel:{intermediate:['group_1','group_2'],final:['group_1','group_2']}}];
const ready={schemaVersion:2,step:'review',level:'intermediate',group:'both',attemptDecision:'decided',attemptKey:'2040-05',preparationState:'studying',support:['progress','planner'],goalMode:'set',dailyTargetMinutes:147};
test('review edits return directly or request only invalidated academic prerequisites, keeping a separate cancel snapshot',async()=>{
 const {module:r,cleanup}=await moduleAt('lib/profile/setup-review.ts');const {module:c,cleanup:cleanContract}=await moduleAt('lib/profile/setup-contract.ts');try{
  for(const step of ['stage','support','goal','group']){const e=r.startReviewEdit(ready,step);assert.equal(e.draft.step,step);assert.equal(r.reviewEditDestination(e.draft,attempts),'review');assert.equal(e.snapshot.step,'review');assert.notEqual(e.draft.support,e.snapshot.support);}
  const e=r.startReviewEdit(ready,'level');const foundation=c.chooseSetupLevel(e.draft,'foundation');assert.equal(r.reviewEditDestination(foundation,attempts),'attempt');const tentative=c.chooseSetupAttempt(foundation,null,attempts);assert.equal(r.reviewEditDestination(tentative,attempts),'review');assert.equal(tentative.group,'not_applicable');assert.equal(tentative.dailyTargetMinutes,147);assert.deepEqual(tentative.support,ready.support);assert.deepEqual(e.snapshot,ready);assert.equal(r.startReviewEdit({...ready,level:'foundation',group:'not_applicable'},'group'),null);
  const attempt=c.chooseSetupAttempt(r.startReviewEdit(ready,'attempt').draft,'2040-01',attempts);assert.equal(r.reviewEditDestination(attempt,attempts),'group');assert.equal(c.validateSetupDraft({...attempt,step:'review'},attempts,true).ok,false);const adjusted={...attempt,group:'group_1',step:'review'};assert.equal(r.reviewEditDestination(adjusted,attempts),'review');assert.equal(c.validateSetupDraft(adjusted,attempts,true).ok,true);
  assert.equal(c.validateSetupDraft({...ready,dailyTargetMinutes:14},attempts,true).ok,false);assert.equal(c.validateSetupDraft({...ready,goalMode:'keep',dailyTargetMinutes:null},attempts,true).ok,true);
 }finally{await cleanup();await cleanContract();}
});
test('dashboard handoff preserves safe study destinations and avoids external or account-entry loops',async()=>{const {module:r,cleanup}=await moduleAt('lib/profile/setup-review.ts');try{
 for(const next of [null,'//external.example','/\\external.example','/onboarding?next=/onboarding','/onboarding-preview','/account/setup','/account/reset','/login','/auth/google','/api/v1/onboarding'])assert.equal(r.setupWorkspaceDestination(next),'/dashboard',String(next));
 assert.equal(r.setupWorkspaceDestination('/progress?view=chapters#saved'),'/progress?view=chapters#saved');assert.equal(r.setupWorkspaceDestination('/planner/today'),'/planner/today');
 }finally{await cleanup();}});
test('review offers labelled edits for applicable rows while keeping actual goals, tentative state and offline completion truthful',async()=>{const {module:c,cleanup}=await moduleAt('components/auth/onboarding/setup.tsx');try{
 const props={initial:{draft:ready,revision:4},attempts,existingGoal:240,onSave:async()=>({revision:5}),onComplete:async()=>{},onExit(){}};
 const html=renderToStaticMarkup(React.createElement(c.SetupScreens,props));for(const label of ['ca level','target attempt','groups','preparation','daily goal','your focus'])assert.match(html,new RegExp(`aria-label="Edit ${label}"`));assert.match(html,/147 minutes \/ day/);assert.match(html,/May 2040/);
 const foundation=renderToStaticMarkup(React.createElement(c.SetupScreens,{...props,online:false,initial:{draft:{...ready,level:'foundation',group:'not_applicable',attemptDecision:'undecided',attemptKey:null,goalMode:'keep',dailyTargetMinutes:null},revision:4}}));assert.doesNotMatch(foundation,/Edit groups/);assert.match(foundation,/240 minutes \/ day \(kept\)/);assert.match(foundation,/Not decided yet/);assert.match(foundation,/have not been synced/);assert.match(foundation,/<button[^>]*disabled=""[^>]*>Open my workspace/);
 }finally{await cleanup();}});
test('setup transport requires an acknowledgement and safely exposes retry and account conflicts',async()=>{const {module:r,cleanup}=await moduleAt('lib/profile/setup-request.ts');try{
 let calls=0;const reply=(body,status=200)=>async(_url,options)=>{calls++;const sent=JSON.parse(options.body);assert.equal(sent.ownerId,'student-a');assert.equal(sent.revision,4);assert.equal(options.credentials,'same-origin');assert.ok(options.signal);return new Response(JSON.stringify(body),{status});};
 assert.equal((await r.sendSetupRequest('student-a',ready,4,'draft',reply({ok:true,revision:5}))).revision,5);
 assert.equal((await r.sendSetupRequest('student-a',ready,4,'complete',reply({ok:true,completed:true}))).completed,true);
 assert.equal((await r.sendSetupRequest('student-a',ready,4,'complete',reply({ok:true,alreadyCompleted:true}))).alreadyCompleted,true);
 assert.equal((await r.sendSetupRequest('student-a',ready,4,'draft',reply({ok:true,alreadyCompleted:true}))).alreadyCompleted,true);
 for(const body of [{ok:true},{ok:true,revision:4},{ok:true,revision:5.5}])await assert.rejects(()=>r.sendSetupRequest('student-a',ready,4,'draft',reply(body)),/Could not confirm/);
 await assert.rejects(()=>r.sendSetupRequest('student-a',ready,4,'complete',reply({ok:true,revision:5})),/Could not confirm/);
 await assert.rejects(()=>r.sendSetupRequest('student-a',ready,4,'draft',reply({ok:false,error:'Account changed'},409)),e=>e.status===409&&e.message==='Account changed');
 await assert.rejects(()=>r.sendSetupRequest('student-a',ready,4,'complete',async()=>new Response('not JSON')),/Could not confirm/);
 await assert.rejects(()=>r.sendSetupRequest('student-a',ready,4,'complete',async()=>{throw new Error('network interrupted');}),e=>e.status===0&&/choices are still here/.test(e.message));
 assert.equal(calls,9,'each call sends at most one mutation; retry remains explicit');
 }finally{await cleanup();}});
