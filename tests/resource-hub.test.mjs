import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const dir=await mkdtemp(path.join(process.cwd(),'.resource-hub-test-'));
let compiled;
try {
  const result=await build({stdin:{contents:"export * from './lib/resources/navigation';export * from './lib/resources/library-list';export * from './components/resources/resource-hub-tabs';export * from './components/icai/resource-browser';export {shellNavigation,routeIsActive} from './components/shell/navigation-contract';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',external:['react'],plugins:[{name:'next-link',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:"import React from 'react';export default function Link({prefetch,...props}){return React.createElement('a',props)}"}));}}]});
  const file=path.join(dir,'compiled.mjs');await writeFile(file,result.outputFiles[0].text);compiled=await import('file://'+file);
} finally {await rm(dir,{recursive:true,force:true});}
test('legacy resource destinations retain academic and community context without pinning the wrong tab',()=>{
  const params={subjectId:'s&1',chapterId:'c1',communityMessageId:'message1',tab:'my',type:'rtp'};
  const official=new URL(compiled.resourceDestination(params,'icai'),'https://test.example');
  assert.equal(official.pathname,'/resources');assert.equal(official.searchParams.get('subject'),'s&1');assert.equal(official.searchParams.get('tab'),'icai');assert.equal(official.searchParams.has('communityMessageId'),false);
  const own=new URL(compiled.resourceDestination(params,'my'),'https://test.example');assert.equal(own.searchParams.get('communityMessageId'),'message1');assert.equal(own.searchParams.get('chapterId'),'c1');
  assert.equal(compiled.resourceTab(['icai']),'my');assert.equal(compiled.resourceTab('shared'),'shared');
});
test('combined note/file pagination sorts the full collection before slicing and never creates empty out-of-range pages',()=>{
  const notes=[{id:'n1',title:'Zeta',updatedAt:'2026-01-01'},{id:'n2',title:'Alpha',updatedAt:'2026-03-01'}];
  const uploads=[{id:'u1',title:'Beta',updatedAt:'2026-02-01'}];
  const page=compiled.libraryPage(notes,uploads,{kind:'all',sort:'recent',page:1,pageSize:2});assert.deepEqual(page.items.map(x=>x.item.id),['n2','u1']);assert.equal(page.pages,2);
  assert.deepEqual(compiled.libraryPage(notes,uploads,{kind:'all',sort:'title',page:99,pageSize:2}).items.map(x=>x.item.id),['n1']);
  assert.deepEqual(compiled.libraryPage(notes,uploads,{kind:'files',sort:'recent',page:1}).items.map(x=>x.kind),['upload']);
  assert.equal(compiled.libraryPage([],[],{kind:'all',sort:'recent',page:3}).current,1);
  assert.equal(notes[0].id,'n1');
});
test('navigation has one Resources destination and still recognizes note detail pages',()=>{
  const knowledge=compiled.shellNavigation.student.find(s=>s.label==='Knowledge').items;
  assert.equal(knowledge.filter(x=>x.href==='/resources').length,1);assert.equal(knowledge.some(x=>['/notes','/resources/icai'].includes(x.href)),false);
  assert.equal(compiled.routeIsActive({href:'/resources'},'/notes/n1'),true);
  const html=renderToStaticMarkup(React.createElement(compiled.ResourceHubTabs,{tab:'icai',params:{}}));assert.equal((html.match(/aria-current="page"/g)||[]).length,1);assert.match(html,/ICAI official/);
});
test('embedded ICAI browser keeps source provenance, search and canonical tab form without a second page heading',()=>{
  const resources=Array.from({length:30},(_,i)=>({id:String(i),title:`Material ${i}`,summary:null,type:'rtp',status:'current',officialUrl:'https://icai.org/material',sourceUrl:'https://icai.org',sourceName:'ICAI',firstSeenAt:'2026-01-01',lastVerifiedAt:'2026-10-14',levelCodes:['intermediate'],attemptKeys:['2027-01'],subjects:[]}));
  const catalog={resources,events:[],levels:[{code:'intermediate',name:'Intermediate'}],subjects:[],attempts:[],filters:{level:'intermediate',attempt:'2027-01',subject:'',type:''},verifiedAt:null};
  const html=renderToStaticMarkup(React.createElement(compiled.IcaiResourceBrowser,{catalog,embedded:true,scopeLocked:true}));
  assert.doesNotMatch(html,/<h1/);assert.match(html,/action="\/resources"/);assert.match(html,/name="tab" value="icai"/);assert.match(html,/Search ICAI resources/);assert.match(html,/First seen/);assert.match(html,/Source page/);assert.equal((html.match(/Open official resource/g)||[]).length,24);assert.match(html,/6 remaining/);
});
