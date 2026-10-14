import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
async function bundle(entry, run) {
  const dir=await mkdtemp(path.join(process.cwd(),'.profile-overview-test-'));
  try {
    const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom'],plugins:[{name:'links',setup(b){b.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'image-mock'}));b.onLoad({filter:/.*/,namespace:'image-mock'},()=>({contents:"import React from 'react';export default function Image({unoptimized,...props}){return React.createElement('img',props)}"}));b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:"import React from 'react';export default function Link(props){return React.createElement('a',props)}"}));}}]});
    const file=path.join(dir,'component.mjs');await writeFile(file,result.outputFiles[0].text);
    return await run(await import('file://'+file));
  } finally { await rm(dir,{recursive:true,force:true}); }
}
test('profile activity uses local calendar days across UTC boundaries, fills missing days, ignores future sessions',async()=>{
  await bundle('lib/profile/activity.ts',({profileActivity})=>{
    const days=profileActivity([
      {ended_at:'2026-10-13 20:00:00',duration_seconds:900},
      {ended_at:'2026-10-14T01:00:00Z',duration_seconds:1800},
      {ended_at:'2026-10-14T12:00:00Z',duration_seconds:9999},
      {ended_at:'invalid',duration_seconds:100},
      {ended_at:'2026-10-07T23:00:00Z',duration_seconds:300},
    ],'Asia/Kolkata',new Date('2026-10-14T10:00:00Z'));
    assert.equal(days.length,7);assert.equal(days[0].date,'2026-10-08');assert.equal(days[0].seconds,300);
    assert.equal(days[6].seconds,2700);assert.equal(days[5].seconds,0);
  });
});
test('overview preserves real empty states, owner links and accurate visibility wording',async()=>{
  await bundle('components/profile/profile-overview.tsx',({ProfileOverview})=>{
    const props={userId:'owner:1',name:'Aisha Khan',avatar:null,bio:'',level:'Foundation',group:'All papers',attempt:'January 2027',dailyMinutes:147,visibility:'private',buddyCount:0,stats:{completed:0,chapters:130,streak:0,totalSeconds:0,activity:Array.from({length:7},(_,i)=>({date:`2026-10-${i+8}`,label:'Day',seconds:0}))}};
    const html=renderToStaticMarkup(React.createElement(ProfileOverview,props));
    assert.match(html,/Your study journey/);assert.match(html,/visible only to you/);assert.match(html,/0 study buddies|<strong>0<\/strong> study buddies/);assert.match(html,/147 minutes/);
    assert.match(html,/completed study sessions will appear/);assert.match(html,/edit=1/);assert.match(html,/\/study-profile\/owner%3A1/);assert.doesNotMatch(html,/followers|following|Delhi|42 days|128h/);
    const unavailable=renderToStaticMarkup(React.createElement(ProfileOverview,{...props,stats:{...props.stats,completed:null,chapters:null}}));
    assert.match(unavailable,/Syllabus not available/);
  });
});
