import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

async function render(entry, name, props) {
  const dir = await mkdtemp(path.join(process.cwd(), '.profile-test-'));
  try {
    const result = await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom'],plugins:[{name:'router',setup(b){
      b.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'mock'}));
      b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const useRouter=()=>({refresh(){}})'}));
    }}]});
    const file = path.join(dir,'component.mjs');await writeFile(file,result.outputFiles[0].text);
    return renderToStaticMarkup(React.createElement((await import('file://'+file))[name], props));
  } finally {await rm(dir,{recursive:true,force:true});}
}

test('profile form keeps valid one-minute goals and dependent study selection in a real submit form', async () => {
  const html = await render('components/auth/profile-form.tsx','ProfileForm',{
    profile:{display_name:'Aisha Khan',avatar_url:null,ca_level:'foundation',group_choice:'not_applicable',attempt_key:'2027-01',daily_target_minutes:147},
    attempts:[{key:'2027-01',label:'January 2027',levels:['foundation']}],avatarSignedUrl:null,identityLabel:'student@example.com',
  });
  assert.match(html, /<form>/);assert.match(html, /type="submit"/);
  assert.match(html, /min="15" max="720" step="1"[^>]*value="147"/);
  assert.match(html, /January 2027/);assert.match(html, /Not applicable/);
  assert.doesNotMatch(html, /database RLS|Canonical academic|Private profile/);
});

test('privacy is collapsed by default and retains independent visibility controls', async () => {
  const html = await render('components/auth/study-profile-privacy.tsx','StudyProfilePrivacy',{
    ownerUserId:'sample-owner',initialSettings:{publicBio:'',profileVisibility:'private',progressVisibility:'buddies',streakVisibility:'public',showLevel:false,showAttempt:false,buddyUserIds:[]},
  });
  assert.match(html, /<details><summary>/);assert.doesNotMatch(html, /<details open/);
  assert.equal((html.match(/<select /g)||[]).length,3);
  assert.match(html, /value="private" selected/);assert.match(html, /value="buddies" selected/);assert.match(html, /value="public" selected/);
  assert.match(html, /\/study-profile\/sample-owner/);assert.match(html, /Exact user ID/);
});
