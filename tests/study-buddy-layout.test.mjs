import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const dir=await mkdtemp(path.join(process.cwd(),'.buddy-layout-test-'));
let components;
try {
  const result=await build({stdin:{contents:"export {StudyBuddyWorkspace} from './components/study-buddy/study-buddy-workspace';export * from './components/study-buddy/layout-sample';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom']});
  const file=path.join(dir,'module.mjs');await writeFile(file,result.outputFiles[0].text);components=await import('file://'+file);
} finally {await rm(dir,{recursive:true,force:true});}
const c=components;
const props={ownerUserId:'preview-owner',initialDashboard:c.sampleBuddyDashboard,initialComparison:c.sampleBuddyComparison,initialOwnerSummary:c.sampleOwnerSummary,preview:true};
const render=values=>renderToStaticMarkup(React.createElement(c.StudyBuddyWorkspace,values));

test('buddy layout selects one workspace and distinguishes unshared data from real study time',()=>{
  const html=render(props);
  assert.equal((html.match(/Your shared progress/g)||[]).length,1);
  assert.match(html,/<h2>Ayesha Khan<\/h2>/);assert.doesNotMatch(html,/<h2>Saad Malik<\/h2>/);
  assert.match(html,/2h 10m/);assert.match(html,/1h 45m/);assert.match(html,/Not shared/);
  assert.match(html,/May 2027/);assert.match(html,/Design preview · sample data/);
  assert.match(html,/Search your buddies/);assert.match(html,/Study buddy views/);
});

test('goal details remain hidden unless both buddies share goals',()=>{
  const dashboard=structuredClone(c.sampleBuddyDashboard);
  dashboard.buddies[0].buddySharing={...dashboard.buddies[0].buddySharing,shareGoals:false};
  dashboard.buddies[0].goals[0].title='PRIVATE_GOAL_SHOULD_NOT_RENDER';
  const html=render({...props,initialDashboard:dashboard});
  assert.doesNotMatch(html,/PRIVATE_GOAL_SHOULD_NOT_RENDER|Create shared goal/);
  assert.match(html,/Both buddies need to enable shared goals/);
});

test('empty buddy page has no invented connections or study metrics',()=>{
  const html=render({ownerUserId:'owner',initialDashboard:{buddies:[],incomingRequests:[],outgoingRequests:[],recentNudges:[],nudgeLimitPer24Hours:3}});
  assert.match(html,/Find your study buddy/);assert.doesNotMatch(html,/Connected|Your shared progress|Ayesha Khan/);
  assert.match(html,/Your buddy ID/);
});

test('owner comparison query cannot read another student\'s sessions',async()=>{
  const source=await readFile('lib/study-buddy/comparison.ts','utf8');
  const sql=source.split('export async function getStudyBuddyOwnerSummary')[1].match(/prepare\(`([\s\S]+?)`\)/)[1];
  const script=`import sqlite3,json,sys
d=sqlite3.connect(':memory:');d.executescript('CREATE TABLE profiles(user_id TEXT,timezone TEXT);CREATE TABLE study_sessions(user_id TEXT,ended_at TEXT,duration_seconds INTEGER);')
d.executemany('INSERT INTO profiles VALUES(?,?)',[('owner','Asia/Kolkata'),('other','Asia/Kolkata')])
d.execute("INSERT INTO study_sessions VALUES('owner',datetime('now'),600)")
d.execute("INSERT INTO study_sessions VALUES('other',datetime('now'),99999)")
rows=d.execute(json.load(sys.stdin)['sql'],('owner',)).fetchall()
assert len(rows)==1 and rows[0][1]==600
`;
  const result=spawnSync('python3',['-c',script],{input:JSON.stringify({sql}),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
