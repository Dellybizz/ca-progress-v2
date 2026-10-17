import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const bundle=await build({entryPoints:['lib/resources/workspace-navigation.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const f=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('folder root is distinct from recursive All files and does not retain an old folder',()=>{
 const root=f.readWorkspaceNavigation('?fmView=folder','my');assert.equal(root.location.view,'folder');assert.equal(root.location.folder,'');
 const all=f.readWorkspaceNavigation('?fmView=all&fmFolder=old','my');assert.equal(all.location.folder,'');
});
test('location and every filter round-trip without dropping host parameters',()=>{
 const query={query:'تدقيق & tax',types:['note','pdf'],sort:'size',secondary:'modified',direction:'asc',subjectId:'s',chapterId:'c',important:true,limit:96,group:'subject',tag:'revision',status:'private',owner:'Zaid',after:'2026-01-01',before:'2026-12-31'};
 const location={collection:'my',view:'folder',folder:'a/b?c',layout:'compact'};
 const search=f.writeWorkspaceNavigation('?tab=my&from=chapter',location,query);const restored=f.readWorkspaceNavigation(search,'my');
 assert.deepEqual(restored,{location,query});assert.equal(new URLSearchParams(search).get('from'),'chapter');
 assert.equal(new URLSearchParams(search).has('cursor'),false);
});
test('untrusted navigation normalizes enums, limits, duplicate kinds and orphan chapters',()=>{
 const {query,location}=f.readWorkspaceNavigation('?fmView=invalid&fmLayout=bad&fm_types=pdf,pdf,evil&fm_limit=999&fm_sort=drop&fm_chapterId=orphan','my');
 assert.equal(location.view,'all');assert.equal(location.layout,'grid');assert.deepEqual(query.types,['pdf']);assert.equal(query.limit,24);assert.equal(query.sort,'modified');assert.equal(query.chapterId,'');
 assert.equal(f.readWorkspaceNavigation('?fmView=folder&fmFolder=private','shared').location.folder,'');
});
test('preference keys isolate users, academic scopes and separator-containing IDs',()=>{
 assert.notEqual(f.workspacePreferenceKey('alice','scope'),f.workspacePreferenceKey('bob','scope'));
 assert.notEqual(f.workspacePreferenceKey('alice','scope'),f.workspacePreferenceKey('alice','other'));
 assert.notEqual(f.workspacePreferenceKey('a:b','c'),f.workspacePreferenceKey('a','b:c'));
});
